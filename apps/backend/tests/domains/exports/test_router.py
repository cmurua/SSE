# POST /exports/log contra Postgres real: la constancia tiene que quedar en
# audit_logs (RNF03).
from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domains.audit.models import AuditLog
from tests.domains.historicals.test_router import auth

URL = "/api/v1/exports/log"

PNG = {
    "format": "png",
    "source": "historicals",
    "operation_id": "OP-2025-001",
    "variables": ["LOGA1", "POTM4"],
    "start": 300.0,
    "end": 5400.0,
    "file_name": "SSE_OP-2025-001_LOGA1-POTM4_00h05m00s-01h30m00s.png",
}


def entries(session: Session) -> list[AuditLog]:
    return list(session.scalars(select(AuditLog).order_by(AuditLog.id)))


def test_sin_token_devuelve_401_y_no_registra(client: TestClient, db_session: Session):
    assert client.post(URL, json=PNG).status_code == 401
    assert entries(db_session) == []


def test_registra_la_exportacion_con_usuario_ip_y_detalle(client, db_session):
    response = client.post(URL, json=PNG, headers=auth("jperez"))

    assert response.status_code == 204
    assert response.content == b""
    [entry] = entries(db_session)
    assert entry.user == "jperez"
    assert entry.action == "export"
    assert entry.result == "success"
    # TestClient se presenta con esta IP.
    assert entry.ip_address == "testclient"
    assert entry.created_at is not None
    assert json.loads(entry.detail) == PNG


def test_desde_tiempo_real_sin_ventana(client, db_session):
    body = {
        "format": "png",
        "source": "realtime",
        "operation_id": "OP-2025-002",
        "variables": ["POTM4"],
        "file_name": "SSE_OP-2025-002_POTM4.png",
    }
    assert client.post(URL, json=body, headers=auth()).status_code == 204
    detail = json.loads(entries(db_session)[0].detail)
    assert detail["source"] == "realtime"
    assert detail["start"] is None and detail["end"] is None


@pytest.mark.parametrize(
    "change",
    [
        # El CSV lo registra el backend al generarlo, no el frontend.
        {"format": "csv"},
        {"format": "pdf"},
        {"source": "reportes"},
        {"variables": []},
        {"variables": ["LOGA1", "POTM4", "TA1"]},
        {"variables": ["NO_EXISTE"]},
        {"start": -1},
        {"start": 10, "end": 5},
        {"file_name": ""},
        {"extra": "x"},
    ],
)
def test_cuerpo_invalido_devuelve_422_y_no_registra(client, db_session, change: dict):
    response = client.post(URL, json={**PNG, **change}, headers=auth())
    assert response.status_code == 422, response.text
    assert entries(db_session) == []
