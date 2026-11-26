# GET /historicals/operations/{id} y GET /historicals/operations/{id}/samples
# contra Postgres real (fixture `db_session`).
#
# Por HTTP, igual que test_router.py: la ventana y la reduccion de puntos
# solo tienen sentido de punta a punta, del parseo de `variables` al GROUP BY
# que promedia en la base.
from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.domains.reactor_data.models import ReactorSample
from app.domains.reactor_data.variable_catalog import REACTOR_VARIABLES
from app.domains.realtime.schemas import RealtimeSample
from tests.domains.historicals.test_router import add_operation, auth, local

OPERATION_ID = "OP-2025-001"
STARTED_AT = local(2025, 3, 10, 9, 0)
DETAIL_URL = f"/api/v1/historicals/operations/{OPERATION_ID}"
SAMPLES_URL = f"{DETAIL_URL}/samples"


def get_samples(client: TestClient, **params) -> dict:
    response = client.get(SAMPLES_URL, params=params, headers=auth())
    assert response.status_code == 200, response.text
    return response.json()


def timestamps(body: dict) -> list[datetime]:
    return [datetime.fromisoformat(sample["timestamp"]) for sample in body["samples"]]


def values_of(body: dict, variable: str) -> list[float | None]:
    return [sample["values"][variable] for sample in body["samples"]]


def at(seconds: float) -> datetime:
    return STARTED_AT + timedelta(seconds=seconds)


@pytest.fixture
def minuto(db_session) -> None:
    """Operacion cerrada de 60 s con una muestra por segundo: LOGA1 = i y
    POTM4 = 10 * i en la muestra i."""
    add_operation(
        db_session,
        OPERATION_ID,
        STARTED_AT,
        minutes=1,
        samples=60,
        values=lambda i: {"LOGA1": float(i), "POTM4": 10.0 * i},
    )


# --- Detalle ----------------------------------------------------------------


def test_detalle_sin_token_devuelve_401(client: TestClient):
    assert client.get(DETAIL_URL).status_code == 401


def test_detalle_lleva_el_resumen_las_notas_y_las_muestras(client, db_session):
    add_operation(
        db_session,
        OPERATION_ID,
        STARTED_AT,
        name="Calibracion detectores BF3",
        minutes=142,
        samples=5,
        notes="Calibracion rutinaria.",
    )

    response = client.get(DETAIL_URL, headers=auth())

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == OPERATION_ID
    assert body["name"] == "Calibracion detectores BF3"
    assert body["operator"] == "Dr. R. Perez"
    assert body["notes"] == "Calibracion rutinaria."
    assert body["duration_minutes"] == 142
    assert body["sample_count"] == 5
    assert datetime.fromisoformat(body["started_at"]) == STARTED_AT
    assert datetime.fromisoformat(body["ended_at"]) == at(142 * 60)
    assert datetime.fromisoformat(body["first_sample_at"]) == at(0)
    assert datetime.fromisoformat(body["last_sample_at"]) == at(4)


def test_detalle_de_una_operacion_sin_muestras(client, db_session):
    add_operation(db_session, OPERATION_ID, STARTED_AT, samples=0)

    body = client.get(DETAIL_URL, headers=auth()).json()

    assert body["sample_count"] == 0
    assert body["first_sample_at"] is None
    assert body["last_sample_at"] is None


def test_detalle_no_cuenta_las_muestras_de_otra_operacion(client, db_session):
    add_operation(db_session, OPERATION_ID, STARTED_AT, samples=3)
    add_operation(db_session, "OP-2025-002", local(2025, 3, 11), samples=7)

    assert client.get(DETAIL_URL, headers=auth()).json()["sample_count"] == 3


def test_detalle_de_una_operacion_inexistente_devuelve_404(client: TestClient):
    response = client.get(DETAIL_URL, headers=auth())

    assert response.status_code == 404
    assert response.json() == {"detail": "Operacion no encontrada"}


def test_detalle_de_la_operacion_abierta_devuelve_404(client, db_session):
    add_operation(db_session, OPERATION_ID, STARTED_AT, minutes=None, samples=3)

    assert client.get(DETAIL_URL, headers=auth()).status_code == 404


# --- Series: ventana completa -----------------------------------------------


def test_series_sin_token_devuelve_401(client: TestClient):
    assert client.get(SAMPLES_URL, params={"variables": "LOGA1"}).status_code == 401


def test_ventana_completa(client, minuto):
    body = get_samples(client, variables="LOGA1,POTM4")

    assert body["operation_id"] == OPERATION_ID
    assert body["variables"] == ["LOGA1", "POTM4"]
    assert body["start"] == 0
    assert body["end"] == 60
    assert body["downsampled"] is False
    assert body["bucket_seconds"] is None
    assert timestamps(body) == [at(i) for i in range(60)]
    assert values_of(body, "LOGA1") == [float(i) for i in range(60)]
    assert values_of(body, "POTM4") == [10.0 * i for i in range(60)]


def test_cada_muestra_tiene_la_forma_del_websocket_de_tiempo_real(client, minuto):
    """Byte a byte lo que manda realtime.samples en `data` (ver build_event),
    con solo las variables pedidas en `values`."""
    second = get_samples(client, variables="POTM4")["samples"][1]

    assert second == RealtimeSample(
        operation_id=OPERATION_ID, timestamp=at(1).astimezone(UTC), values={"POTM4": 10.0}
    ).model_dump(mode="json")


@pytest.mark.parametrize("max_points", [2000, 10], ids=["crudas", "reducidas"])
def test_los_timestamps_viajan_en_utc(client, db_session, minuto, max_points: int):
    """Como en realtime.samples, aunque Postgres devuelva las fechas en otra
    zona horaria (la de la sesion, que depende de la configuracion del
    servidor)."""
    db_session.execute(text("SET TIME ZONE 'America/Argentina/Cordoba'"))
    db_session.expire_all()

    body = get_samples(client, variables="LOGA1", max_points=max_points)

    assert body["samples"][0]["timestamp"] == "2025-03-10T12:00:00Z"


def test_respeta_el_orden_pedido_y_descarta_duplicados(client, minuto):
    body = get_samples(client, variables="POTM4, LOGA1,POTM4")

    assert body["variables"] == ["POTM4", "LOGA1"]
    assert list(body["samples"][0]["values"]) == ["POTM4", "LOGA1"]


def test_un_canal_sin_datos_viaja_como_null(client, db_session):
    add_operation(
        db_session,
        OPERATION_ID,
        STARTED_AT,
        minutes=1,
        samples=3,
        values=lambda i: {"LOGA1": None if i == 1 else 1.0},
    )

    assert values_of(get_samples(client, variables="LOGA1"), "LOGA1") == [1.0, None, 1.0]


def test_operacion_sin_muestras_devuelve_series_vacias(client, db_session):
    add_operation(db_session, OPERATION_ID, STARTED_AT, minutes=1, samples=0)

    body = get_samples(client, variables="LOGA1")

    assert body["samples"] == []
    assert body["downsampled"] is False


def test_no_mezcla_muestras_de_otra_operacion(client, db_session, minuto):
    add_operation(
        db_session,
        "OP-2025-002",
        local(2025, 3, 10, 11, 0),
        minutes=1,
        samples=60,
        values=lambda i: {"LOGA1": -1.0},
    )

    assert -1.0 not in values_of(get_samples(client, variables="LOGA1"), "LOGA1")


# --- Series: ventana parcial ------------------------------------------------


def test_ventana_parcial_incluye_start_y_excluye_end(client, minuto):
    body = get_samples(client, variables="LOGA1", start=10, end=20)

    assert body["start"] == 10
    assert body["end"] == 20
    assert timestamps(body) == [at(i) for i in range(10, 20)]
    assert values_of(body, "LOGA1") == [float(i) for i in range(10, 20)]


def test_ventana_con_segundos_fraccionarios(client, minuto):
    body = get_samples(client, variables="LOGA1", start=9.5, end=12.5)

    assert timestamps(body) == [at(10), at(11), at(12)]


def test_solo_start_llega_hasta_el_final(client, minuto):
    body = get_samples(client, variables="LOGA1", start=55)

    assert body["end"] == 60
    assert timestamps(body) == [at(i) for i in range(55, 60)]


def test_solo_end_arranca_desde_el_inicio(client, minuto):
    body = get_samples(client, variables="LOGA1", end=3)

    assert body["start"] == 0
    assert timestamps(body) == [at(0), at(1), at(2)]


def test_end_posterior_al_cierre_se_recorta(client, minuto):
    body = get_samples(client, variables="LOGA1", start=50, end=10_000)

    assert body["end"] == 60
    assert len(body["samples"]) == 10


def test_ventana_despues_del_cierre_viene_vacia(client, minuto):
    body = get_samples(client, variables="LOGA1", start=100, end=200)

    assert body["start"] == body["end"] == 60
    assert body["samples"] == []


# --- Series: reduccion de puntos --------------------------------------------


def test_con_tantas_muestras_como_max_points_no_reduce(client, minuto):
    body = get_samples(client, variables="LOGA1", max_points=60)

    assert body["downsampled"] is False
    assert body["bucket_seconds"] is None
    assert len(body["samples"]) == 60


def test_con_mas_muestras_que_max_points_promedia_por_intervalo(client, minuto):
    body = get_samples(client, variables="LOGA1,POTM4", max_points=10)

    assert body["downsampled"] is True
    assert body["bucket_seconds"] == 6
    # Intervalo k: muestras 6k a 6k+5, cuyo promedio es 6k + 2.5.
    assert timestamps(body) == [at(6 * k) for k in range(10)]
    assert values_of(body, "LOGA1") == [6 * k + 2.5 for k in range(10)]
    assert values_of(body, "POTM4") == [10 * (6 * k + 2.5) for k in range(10)]


def test_reduce_dentro_de_una_ventana_parcial(client, minuto):
    body = get_samples(client, variables="LOGA1", start=30, end=60, max_points=3)

    assert body["bucket_seconds"] == 10
    assert timestamps(body) == [at(30), at(40), at(50)]
    assert values_of(body, "LOGA1") == [34.5, 44.5, 54.5]


def test_nunca_devuelve_mas_de_max_points(client, minuto):
    """Un intervalo que no divide la ventana justo no agrega un punto extra."""
    body = get_samples(client, variables="LOGA1", max_points=7)

    assert len(body["samples"]) == 7
    assert body["bucket_seconds"] == pytest.approx(60 / 7)


def test_el_promedio_ignora_los_null_y_un_intervalo_vacio_queda_null(client, db_session):
    # 4 muestras en 2 intervalos de 2: el primero con un NULL, el segundo
    # sin ningun dato de LOGA1.
    add_operation(
        db_session,
        OPERATION_ID,
        STARTED_AT,
        minutes=1,
        samples=4,
        values=lambda i: {"LOGA1": [4.0, None, None, None][i]},
    )

    body = get_samples(client, variables="LOGA1", end=4, max_points=2)

    assert body["downsampled"] is True
    assert values_of(body, "LOGA1") == [4.0, None]


def test_los_intervalos_sin_muestras_no_aparecen(client, db_session):
    add_operation(
        db_session,
        OPERATION_ID,
        STARTED_AT,
        minutes=1,
        samples=60,
        values=lambda i: {"LOGA1": float(i)},
    )
    # Hueco: se borran las muestras de los segundos 20 a 39.
    db_session.execute(
        ReactorSample.__table__.delete().where(
            ReactorSample.timestamp >= at(20), ReactorSample.timestamp < at(40)
        )
    )

    body = get_samples(client, variables="LOGA1", max_points=6)

    assert timestamps(body) == [at(0), at(10), at(40), at(50)]


def test_operacion_de_3_horas_se_reduce_a_2000_puntos_en_menos_de_1_s(client, db_session):
    """Criterio de aceptacion de la tarea 5.2."""
    add_operation(
        db_session,
        OPERATION_ID,
        STARTED_AT,
        minutes=180,
        samples=10_800,
        values=lambda i: {"LOGA1": float(i), "POTM4": float(i % 10)},
    )

    started = time.perf_counter()
    response = client.get(SAMPLES_URL, params={"variables": "LOGA1,POTM4"}, headers=auth())
    elapsed = time.perf_counter() - started

    assert response.status_code == 200
    body = response.json()
    assert body["downsampled"] is True
    assert body["bucket_seconds"] == pytest.approx(5.4)
    assert len(body["samples"]) == 2000
    assert elapsed < 1.0, f"Tardo {elapsed:.3f} s"


# --- Series: errores --------------------------------------------------------


def test_series_de_una_operacion_inexistente_devuelve_404(client: TestClient):
    response = client.get(SAMPLES_URL, params={"variables": "LOGA1"}, headers=auth())

    assert response.status_code == 404
    assert response.json() == {"detail": "Operacion no encontrada"}


def test_series_de_la_operacion_abierta_devuelve_404(client, db_session):
    add_operation(db_session, OPERATION_ID, STARTED_AT, minutes=None, samples=3)

    response = client.get(SAMPLES_URL, params={"variables": "LOGA1"}, headers=auth())

    assert response.status_code == 404


def test_variable_inexistente_devuelve_422_y_la_nombra(client, minuto):
    response = client.get(SAMPLES_URL, params={"variables": "LOGA1,NOEXISTE"}, headers=auth())

    assert response.status_code == 422
    [error] = response.json()["detail"]
    assert "NOEXISTE" in error["msg"]


def test_hasta_8_variables_es_valido(client, minuto):
    eight = ",".join(variable["id"] for variable in REACTOR_VARIABLES[:8])

    body = get_samples(client, variables=eight)

    assert len(body["samples"][0]["values"]) == 8


def test_mas_de_8_variables_devuelve_422(client, minuto):
    nine = ",".join(variable["id"] for variable in REACTOR_VARIABLES[:9])

    response = client.get(SAMPLES_URL, params={"variables": nine}, headers=auth())

    assert response.status_code == 422
    [error] = response.json()["detail"]
    assert "hasta 8 variables" in error["msg"]


@pytest.mark.parametrize(
    "params",
    [
        pytest.param({}, id="sin-variables"),
        pytest.param({"variables": ""}, id="variables-vacio"),
        pytest.param({"variables": "LOGA1,"}, id="elemento-vacio"),
        pytest.param({"variables": "loga1"}, id="id-en-minusculas"),
        pytest.param({"variables": "LOGA1", "start": -1}, id="start-negativo"),
        pytest.param({"variables": "LOGA1", "end": 0}, id="end-cero"),
        pytest.param({"variables": "LOGA1", "start": 20, "end": 10}, id="start-posterior-a-end"),
        pytest.param({"variables": "LOGA1", "start": 10, "end": 10}, id="start-igual-a-end"),
        pytest.param({"variables": "LOGA1", "end": "inf"}, id="end-infinito"),
        pytest.param({"variables": "LOGA1", "start": "nan"}, id="start-nan"),
        pytest.param({"variables": "LOGA1", "max_points": 1}, id="max_points-1"),
        pytest.param({"variables": "LOGA1", "max_points": 10_001}, id="max_points-excesivo"),
        pytest.param({"variables": "LOGA1", "maxpoints": 10}, id="parametro-desconocido"),
    ],
)
def test_parametros_invalidos_devuelven_422(client, minuto, params: dict):
    response = client.get(SAMPLES_URL, params=params, headers=auth())

    assert response.status_code == 422
