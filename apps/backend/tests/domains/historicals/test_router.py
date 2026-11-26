# GET /historicals/operations contra Postgres real (fixture `db_session`).
#
# Se prueba por HTTP y no llamando al servicio porque los filtros solo tienen
# sentido de punta a punta: el parseo de los parametros, la traduccion de
# fechas a la hora de Cordoba y el SQL que las aplica. Cada test corre dentro
# de una transaccion que se deshace al terminar (ver tests/conftest.py). El
# cliente HTTP es el fixture `client` de conftest.py.
from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, insert
from sqlalchemy.orm import Session

from app.core.security import create_access_token
from app.domains.historicals.models import Operation
from app.domains.historicals.service import LOCAL_TIMEZONE
from app.domains.reactor_data.models import ReactorSample
from app.domains.reactor_data.variable_catalog import sample_column

URL = "/api/v1/historicals/operations"


def auth(username: str = "jperez") -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(username)}"}


def local(year: int, month: int, day: int, hour: int = 12, minute: int = 0) -> datetime:
    """Instante en la hora de Cordoba, que es como piensa las fechas el usuario."""
    return datetime(year, month, day, hour, minute, tzinfo=LOCAL_TIMEZONE)


def add_operation(
    session: Session,
    operation_id: str,
    started_at: datetime,
    *,
    name: str = "Practica curso Reactores I",
    minutes: int | None = 60,
    samples: int = 0,
    notes: str | None = None,
    values: Callable[[int], dict[str, float | None]] | None = None,
) -> Operation:
    """Crea una operacion; `minutes=None` la deja abierta.

    Las `samples` muestras van a 1 Hz desde `started_at`. `values(i)` da los
    valores de la muestra `i` por ID del catalogo; sin `values`, las
    muestras solo llevan el timestamp.
    """
    operation = Operation(
        id=operation_id,
        name=name,
        started_at=started_at,
        ended_at=None if minutes is None else started_at + timedelta(minutes=minutes),
        operator="Dr. R. Perez",
        notes=notes,
    )
    session.add(operation)
    session.flush()
    if samples:
        session.execute(
            insert(ReactorSample),
            [
                {
                    "operation_id": operation_id,
                    "timestamp": started_at + timedelta(seconds=i),
                    **{
                        sample_column(variable): value
                        for variable, value in (values(i) if values else {}).items()
                    },
                }
                for i in range(samples)
            ],
        )
    return operation


def ids(response) -> list[str]:
    assert response.status_code == 200, response.text
    return [item["id"] for item in response.json()["items"]]


# --- Sesion -----------------------------------------------------------------


def test_sin_token_devuelve_401(client: TestClient):
    response = client.get(URL)

    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"


# --- Forma de la respuesta y orden ------------------------------------------


def test_sin_operaciones_devuelve_pagina_vacia(client: TestClient):
    response = client.get(URL, headers=auth())

    assert response.status_code == 200
    assert response.json() == {"items": [], "total": 0, "page": 1, "page_size": 20}


def test_cada_item_lleva_el_resumen_las_notas_y_las_muestras(client, db_session):
    add_operation(
        db_session,
        "OP-2025-001",
        local(2025, 3, 10, 9, 0),
        name="Calibracion detectores BF3",
        minutes=142,
        samples=5,
        notes="Calibracion rutinaria.",
    )

    [item] = client.get(URL, headers=auth()).json()["items"]

    assert item["id"] == "OP-2025-001"
    assert item["name"] == "Calibracion detectores BF3"
    assert item["operator"] == "Dr. R. Perez"
    assert item["notes"] == "Calibracion rutinaria."
    assert item["sample_count"] == 5
    assert item["duration_minutes"] == 142
    assert datetime.fromisoformat(item["started_at"]) == local(2025, 3, 10, 9, 0)
    assert datetime.fromisoformat(item["ended_at"]) == local(2025, 3, 10, 11, 22)


def test_sample_count_es_cero_si_la_operacion_no_tiene_muestras(client, db_session):
    add_operation(db_session, "OP-2025-001", local(2025, 3, 10), samples=0)
    add_operation(db_session, "OP-2025-002", local(2025, 3, 11), samples=3)

    items = client.get(URL, headers=auth()).json()["items"]

    assert {item["id"]: item["sample_count"] for item in items} == {
        "OP-2025-001": 0,
        "OP-2025-002": 3,
    }


def test_ordena_de_la_mas_reciente_a_la_mas_vieja(client, db_session):
    add_operation(db_session, "OP-2025-002", local(2025, 3, 12))
    add_operation(db_session, "OP-2025-001", local(2025, 3, 10))
    add_operation(db_session, "OP-2025-003", local(2025, 3, 14))

    assert ids(client.get(URL, headers=auth())) == ["OP-2025-003", "OP-2025-002", "OP-2025-001"]


def test_cuenta_las_muestras_en_una_sola_consulta(client, db_session):
    """Sin N+1: la cantidad de SELECT no crece con las filas de la pagina."""
    for day in range(1, 11):
        add_operation(db_session, f"OP-2025-{day:03d}", local(2025, 3, day), samples=2)

    selects: list[str] = []

    def record(conn, cursor, statement, *args):
        if statement.lstrip().upper().startswith("SELECT"):
            selects.append(statement)

    connection = db_session.connection()
    event.listen(connection, "before_cursor_execute", record)
    try:
        few = client.get(URL, params={"page_size": 2}, headers=auth())
        few_selects = len(selects)
        selects.clear()
        many = client.get(URL, params={"page_size": 10}, headers=auth())
        many_selects = len(selects)
    finally:
        event.remove(connection, "before_cursor_execute", record)

    assert len(ids(few)) == 2
    assert len(ids(many)) == 10
    # total + pagina + conteo agrupado de muestras.
    assert few_selects == many_selects == 3


# --- Filtro por fechas ------------------------------------------------------


@pytest.fixture
def marzo(db_session: Session) -> None:
    """Una operacion por dia del 10 al 14 de marzo, al mediodia de Cordoba."""
    for day in range(10, 15):
        add_operation(db_session, f"OP-2025-0{day}", local(2025, 3, day))


def test_from_solo(client, marzo):
    response = client.get(URL, params={"from": "2025-03-13"}, headers=auth())

    assert ids(response) == ["OP-2025-014", "OP-2025-013"]


def test_to_solo(client, marzo):
    response = client.get(URL, params={"to": "2025-03-11"}, headers=auth())

    assert ids(response) == ["OP-2025-011", "OP-2025-010"]


def test_from_y_to_son_inclusivos(client, marzo):
    response = client.get(URL, params={"from": "2025-03-11", "to": "2025-03-13"}, headers=auth())

    assert ids(response) == ["OP-2025-013", "OP-2025-012", "OP-2025-011"]


def test_fechas_en_los_extremos_del_calendario(client, marzo):
    response = client.get(URL, params={"from": "0001-01-01", "to": "9999-12-31"}, headers=auth())

    assert len(ids(response)) == 5


def test_un_solo_dia_abarca_de_medianoche_a_medianoche(client, db_session):
    add_operation(db_session, "OP-2025-001", local(2025, 3, 9, 23, 59))
    add_operation(db_session, "OP-2025-002", local(2025, 3, 10, 0, 0))
    add_operation(db_session, "OP-2025-003", local(2025, 3, 10, 23, 59))
    add_operation(db_session, "OP-2025-004", local(2025, 3, 11, 0, 0))

    response = client.get(URL, params={"from": "2025-03-10", "to": "2025-03-10"}, headers=auth())

    assert ids(response) == ["OP-2025-003", "OP-2025-002"]


def test_las_fechas_se_interpretan_en_la_hora_de_cordoba(client, db_session):
    # 22:30 del 9 en Cordoba es 01:30 del 10 en UTC: para el usuario es el 9.
    started = datetime(2025, 3, 10, 1, 30, tzinfo=UTC)
    add_operation(db_session, "OP-2025-001", started)

    dia_9 = client.get(URL, params={"from": "2025-03-09", "to": "2025-03-09"}, headers=auth())
    dia_10 = client.get(URL, params={"from": "2025-03-10", "to": "2025-03-10"}, headers=auth())

    assert ids(dia_9) == ["OP-2025-001"]
    assert ids(dia_10) == []


# --- Busqueda por texto -----------------------------------------------------


@pytest.fixture
def catalogo(db_session: Session) -> None:
    add_operation(db_session, "OP-2024-007", local(2024, 11, 5), name="Verificacion barra de seguridad")
    add_operation(db_session, "OP-2025-001", local(2025, 3, 10), name="Practica curso Reactores I")
    add_operation(db_session, "OP-2025-002", local(2025, 3, 12), name="Practica curso Reactores II")
    add_operation(db_session, "OP-2025-003", local(2025, 3, 14), name="Calibracion detectores BF3")


def test_q_busca_en_el_id(client, catalogo):
    response = client.get(URL, params={"q": "2024"}, headers=auth())

    assert ids(response) == ["OP-2024-007"]


def test_q_busca_en_el_id_sin_distinguir_mayusculas(client, catalogo):
    response = client.get(URL, params={"q": "op-2025-003"}, headers=auth())

    assert ids(response) == ["OP-2025-003"]


def test_q_busca_en_el_nombre_sin_distinguir_mayusculas(client, catalogo):
    response = client.get(URL, params={"q": "REACTORES"}, headers=auth())

    assert ids(response) == ["OP-2025-002", "OP-2025-001"]


def test_q_busca_por_fragmento(client, catalogo):
    response = client.get(URL, params={"q": "bf3"}, headers=auth())

    assert ids(response) == ["OP-2025-003"]


def test_q_trata_los_comodines_como_texto(client, catalogo):
    """`%` y `_` se buscan literales, no como comodines de LIKE."""
    assert ids(client.get(URL, params={"q": "%"}, headers=auth())) == []
    assert ids(client.get(URL, params={"q": "OP_2025"}, headers=auth())) == []


def test_q_vacio_o_en_blanco_no_filtra(client, catalogo):
    assert len(ids(client.get(URL, params={"q": ""}, headers=auth()))) == 4
    assert len(ids(client.get(URL, params={"q": "   "}, headers=auth()))) == 4


def test_q_sin_coincidencias(client, catalogo):
    response = client.get(URL, params={"q": "inexistente"}, headers=auth())

    assert response.json()["items"] == []
    assert response.json()["total"] == 0


# --- Filtros combinados -----------------------------------------------------


def test_fechas_y_texto_combinados(client, catalogo):
    response = client.get(
        URL,
        params={"from": "2025-03-11", "to": "2025-03-31", "q": "practica"},
        headers=auth(),
    )

    assert ids(response) == ["OP-2025-002"]
    assert response.json()["total"] == 1


def test_filtros_combinados_con_paginacion(client, catalogo):
    response = client.get(
        URL,
        params={"from": "2025-01-01", "q": "op-2025", "page": 2, "page_size": 2},
        headers=auth(),
    )

    assert ids(response) == ["OP-2025-001"]
    assert response.json()["total"] == 3


# --- Paginacion -------------------------------------------------------------


@pytest.fixture
def veinticinco(db_session: Session) -> list[str]:
    """25 operaciones, una por dia; devuelve los ids de la mas nueva a la mas vieja."""
    for day in range(1, 26):
        add_operation(db_session, f"OP-2025-{day:03d}", local(2025, 1, day))
    return [f"OP-2025-{day:03d}" for day in range(25, 0, -1)]


def test_por_defecto_pagina_1_de_20(client, veinticinco):
    body = client.get(URL, headers=auth()).json()

    assert [item["id"] for item in body["items"]] == veinticinco[:20]
    assert body["total"] == 25
    assert body["page"] == 1
    assert body["page_size"] == 20


def test_la_ultima_pagina_trae_el_resto(client, veinticinco):
    body = client.get(URL, params={"page": 2}, headers=auth()).json()

    assert [item["id"] for item in body["items"]] == veinticinco[20:]
    assert body["total"] == 25
    assert body["page"] == 2


def test_las_paginas_no_se_solapan_ni_dejan_huecos(client, veinticinco):
    seen = []
    for page in range(1, 4):
        seen += ids(client.get(URL, params={"page": page, "page_size": 10}, headers=auth()))

    assert seen == veinticinco


def test_una_pagina_mas_alla_del_final_viene_vacia_con_el_total(client, veinticinco):
    body = client.get(URL, params={"page": 9}, headers=auth()).json()

    assert body["items"] == []
    assert body["total"] == 25


def test_una_pagina_enorme_no_rompe_la_consulta(client, veinticinco):
    """Un OFFSET que no entra en un bigint no llega a Postgres."""
    body = client.get(URL, params={"page": 2**62}, headers=auth()).json()

    assert body["items"] == []
    assert body["total"] == 25


def test_page_size_maximo(client, veinticinco):
    body = client.get(URL, params={"page_size": 100}, headers=auth()).json()

    assert len(body["items"]) == 25
    assert body["page_size"] == 100


def test_desempata_por_id_si_dos_empiezan_al_mismo_tiempo(client, db_session):
    same = local(2025, 3, 10)
    for suffix in ("001", "003", "002"):
        add_operation(db_session, f"OP-2025-{suffix}", same)

    first = ids(client.get(URL, params={"page_size": 2}, headers=auth()))
    second = ids(client.get(URL, params={"page_size": 2, "page": 2}, headers=auth()))

    assert first + second == ["OP-2025-003", "OP-2025-002", "OP-2025-001"]


# --- Operacion abierta (D7) -------------------------------------------------


def test_la_operacion_abierta_no_aparece(client, db_session):
    add_operation(db_session, "OP-2025-001", local(2025, 3, 10), samples=2)
    add_operation(db_session, "OP-2025-002", local(2025, 3, 11), minutes=None, samples=2)

    body = client.get(URL, headers=auth()).json()

    assert [item["id"] for item in body["items"]] == ["OP-2025-001"]
    assert body["total"] == 1


def test_la_operacion_aparece_apenas_se_cierra(client, db_session):
    add_operation(db_session, "OP-2025-001", local(2025, 3, 10))
    abierta = add_operation(db_session, "OP-2025-002", local(2025, 3, 11), minutes=None, samples=4)
    assert ids(client.get(URL, headers=auth())) == ["OP-2025-001"]

    # Lo mismo que hace ReactorStateService al bajar SERMO: escribir ended_at.
    abierta.ended_at = abierta.started_at + timedelta(minutes=30)
    db_session.flush()

    items = client.get(URL, headers=auth()).json()["items"]
    assert [item["id"] for item in items] == ["OP-2025-002", "OP-2025-001"]
    assert items[0]["sample_count"] == 4
    assert items[0]["duration_minutes"] == 30


def test_la_abierta_tampoco_aparece_al_buscarla(client, db_session):
    add_operation(db_session, "OP-2025-001", local(2025, 3, 11), minutes=None)

    response = client.get(URL, params={"q": "OP-2025-001", "from": "2025-03-11"}, headers=auth())

    assert ids(response) == []


# --- Errores 422 ------------------------------------------------------------


@pytest.mark.parametrize(
    "params",
    [
        pytest.param({"from": "2025-03-12", "to": "2025-03-11"}, id="from-posterior-a-to"),
        pytest.param({"page": 0}, id="page-0"),
        pytest.param({"page": -1}, id="page-negativa"),
        pytest.param({"page_size": 0}, id="page_size-0"),
        pytest.param({"page_size": 101}, id="page_size-mayor-a-100"),
        pytest.param({"from": "12/03/2025"}, id="fecha-mal-formada"),
        pytest.param({"page": "uno"}, id="page-no-numerica"),
        pytest.param({"pagesize": 10}, id="parametro-desconocido"),
        pytest.param({"date_from": "2025-03-10"}, id="nombre-interno-de-from"),
        pytest.param({"q": "a\x00b"}, id="q-con-NUL"),
        pytest.param({"q": "x" * 101}, id="q-demasiado-largo"),
    ],
)
def test_parametros_invalidos_devuelven_422(client: TestClient, params: dict):
    response = client.get(URL, params=params, headers=auth())

    assert response.status_code == 422


def test_from_posterior_a_to_explica_el_error(client: TestClient):
    response = client.get(URL, params={"from": "2025-03-12", "to": "2025-03-11"}, headers=auth())

    [error] = response.json()["detail"]
    assert "`from` no puede ser posterior a `to`" in error["msg"]


def test_from_igual_a_to_es_valido(client: TestClient):
    response = client.get(URL, params={"from": "2025-03-12", "to": "2025-03-12"}, headers=auth())

    assert response.status_code == 200
