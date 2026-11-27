# GET /historicals/operations/{id}/samples.csv contra Postgres real.
#
# El CSV se lee como lo leeria una planilla: BOM, `;`, coma decimal. Cada
# test corre en una transaccion que se deshace al terminar.
from __future__ import annotations

import csv
import io
import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, select

from app.domains.audit.models import AuditLog
from app.domains.historicals.csv_export import BOM
from app.domains.reactor_data.variable_catalog import REACTOR_VARIABLES
from tests.domains.historicals.test_operation_detail import (
    DETAIL_URL,
    OPERATION_ID,
    STARTED_AT,
    minuto,  # noqa: F401 (fixture)
)
from tests.domains.historicals.test_router import add_operation, auth

CSV_URL = f"{DETAIL_URL}/samples.csv"


def get_csv(client: TestClient, **params) -> tuple[list[str], list[list[str]]]:
    """Encabezado y filas, parseados como una planilla en espanol."""
    response = client.get(CSV_URL, params=params, headers=auth())
    assert response.status_code == 200, response.text
    text = response.content.decode("utf-8")
    assert text.startswith(BOM)
    header, *rows = csv.reader(io.StringIO(text.removeprefix(BOM)), delimiter=";")
    return header, rows


def column(header: list[str], rows: list[list[str]], name: str) -> list[str]:
    index = header.index(name)
    return [row[index] for row in rows]


def number(cell: str) -> float:
    return float(cell.replace(",", "."))


# --- Sesion y errores -------------------------------------------------------


def test_sin_token_devuelve_401(client: TestClient):
    assert client.get(CSV_URL).status_code == 401


def test_operacion_inexistente_devuelve_404(client: TestClient):
    response = client.get(CSV_URL, headers=auth())
    assert response.status_code == 404
    assert response.json() == {"detail": "Operacion no encontrada"}


def test_operacion_abierta_devuelve_404(client, db_session):
    add_operation(db_session, OPERATION_ID, STARTED_AT, minutes=None, samples=5)
    assert client.get(CSV_URL, headers=auth()).status_code == 404


@pytest.mark.parametrize(
    "params",
    [
        {"variables": "NO_EXISTE"},
        {"variables": "LOGA1,,POTM4"},
        {"start": -1},
        {"start": 10, "end": 10},
        {"end": "nan"},
        {"max_points": 100},
    ],
)
def test_parametros_invalidos_devuelven_422(client, minuto, params):  # noqa: F811
    assert client.get(CSV_URL, params=params, headers=auth()).status_code == 422


# --- Archivo ------------------------------------------------------------------


def test_cabeceras_de_descarga(client, minuto):  # noqa: F811
    response = client.get(
        CSV_URL, params={"variables": "LOGA1,POTM4", "start": 10, "end": 20}, headers=auth()
    )
    assert response.headers["content-type"] == "text/csv; charset=utf-8"
    assert response.headers["content-disposition"] == (
        'attachment; filename="SSE_OP-2025-001_LOGA1-POTM4_00h00m10s-00h00m20s.csv"'
    )


def test_sin_ventana_el_nombre_cubre_la_operacion_entera(client, minuto):  # noqa: F811
    response = client.get(CSV_URL, params={"variables": "POTM4"}, headers=auth())
    assert 'filename="SSE_OP-2025-001_POTM4_00h00m00s-00h01m00s.csv"' in (
        response.headers["content-disposition"]
    )


# --- Contenido --------------------------------------------------------------


def test_encabezados_y_valores(client, minuto):  # noqa: F811
    header, rows = get_csv(client, variables="LOGA1,POTM4")

    assert header == ["timestamp", "LOGA1 [c/s]", "POTM4 [W]"]
    assert len(rows) == 60
    assert rows[0] == ["2025-03-10T12:00:00.000+00:00", "0,0", "0,0"]
    assert rows[59] == ["2025-03-10T12:00:59.000+00:00", "59,0", "590,0"]
    assert [number(v) for v in column(header, rows, "POTM4 [W]")] == [10.0 * i for i in range(60)]


def test_respeta_el_orden_pedido_y_descarta_duplicados(client, minuto):  # noqa: F811
    header, _ = get_csv(client, variables="POTM4,LOGA1,POTM4")
    assert header == ["timestamp", "POTM4 [W]", "LOGA1 [c/s]"]


def test_ventana_parcial_incluye_start_y_excluye_end(client, minuto):  # noqa: F811
    header, rows = get_csv(client, variables="LOGA1", start=10, end=20)
    assert [number(v) for v in column(header, rows, "LOGA1 [c/s]")] == [
        float(i) for i in range(10, 20)
    ]


def test_solo_start_llega_hasta_el_final(client, minuto):  # noqa: F811
    _, rows = get_csv(client, variables="LOGA1", start=55)
    assert len(rows) == 5


def test_ventana_despues_del_cierre_trae_solo_el_encabezado(client, minuto):  # noqa: F811
    header, rows = get_csv(client, variables="LOGA1", start=120, end=180)
    assert header == ["timestamp", "LOGA1 [c/s]"]
    assert rows == []


def test_sin_variables_van_todas_las_del_catalogo(client, minuto):  # noqa: F811
    for params in ({}, {"variables": ""}):
        header, rows = get_csv(client, **params)
        assert header[1:] == [f"{v['id']} [{v['unit']}]" for v in REACTOR_VARIABLES]
        assert len(rows) == 60

    response = client.get(CSV_URL, headers=auth())
    assert "_todas_" in response.headers["content-disposition"]


def test_un_canal_sin_dato_es_una_celda_vacia(client, db_session):
    add_operation(
        db_session,
        OPERATION_ID,
        STARTED_AT,
        minutes=1,
        samples=3,
        values=lambda i: {"POTM4": None if i == 1 else 1.5},
    )
    _, rows = get_csv(client, variables="POTM4")
    assert [row[1] for row in rows] == ["1,5", "", "1,5"]


def test_resolucion_completa_sin_reducir_puntos(client, db_session):
    # Mas muestras que el maximo de puntos de las series (10 000).
    add_operation(
        db_session,
        OPERATION_ID,
        STARTED_AT,
        minutes=180,
        samples=10_800,
        values=lambda i: {"POTM4": float(i)},
    )
    _, rows = get_csv(client, variables="POTM4")
    assert len(rows) == 10_800
    assert [number(row[1]) for row in rows] == [float(i) for i in range(10_800)]


def test_lee_la_base_con_un_cursor_del_lado_del_servidor(client, db_session, minuto):  # noqa: F811
    # Streaming de verdad: la consulta de las muestras pide `stream_results`
    # (cursor con nombre en psycopg 3), no un fetchall de la ventana entera.
    streamed = []

    def record(conn, cursor, statement, parameters, context, executemany):
        if "FROM reactor_samples" in statement:
            streamed.append(context.execution_options.get("stream_results", False))

    engine = db_session.get_bind().engine
    event.listen(engine, "before_cursor_execute", record)
    try:
        get_csv(client, variables="POTM4")
    finally:
        event.remove(engine, "before_cursor_execute", record)

    assert streamed == [True]


# --- Auditoria (RNF03) --------------------------------------------------------


def test_cada_descarga_queda_registrada(client, db_session, minuto):  # noqa: F811
    client.get(CSV_URL, params={"variables": "LOGA1", "start": 10, "end": 20}, headers=auth())

    [entry] = db_session.scalars(select(AuditLog)).all()
    assert entry.user == "jperez"
    assert entry.action == "export"
    assert json.loads(entry.detail) == {
        "format": "csv",
        "source": "historicals",
        "operation_id": OPERATION_ID,
        "variables": ["LOGA1"],
        "start": 10.0,
        "end": 20.0,
        "file_name": "SSE_OP-2025-001_LOGA1_00h00m10s-00h00m20s.csv",
    }


def test_un_pedido_rechazado_no_queda_registrado(client, db_session):
    client.get(CSV_URL, headers=auth())  # 404
    assert db_session.scalars(select(AuditLog)).all() == []
