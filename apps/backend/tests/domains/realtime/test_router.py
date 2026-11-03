# GET /realtime/status y WS /realtime/ws de punta a punta, con el lifespan
# real: lo que se prueba es tambien el cableado de app/main.py (la muestra
# guardada llega al socket, el SERMO OFF lo cierra). Solo se reemplaza el
# runtime, para no depender del broker ni de la base; las muestras se
# inyectan con FakeAcquisition.emit(), el mismo camino que _notify().
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app import main
from app.composition import ReactorRuntime
from app.core.security import create_access_token
from app.domains.reactor_data.acquisition import AcquiredSample
from app.main import app
from app.mqtt.schemas import SermoSignal
from app.websocket.events import WSCloseCode
from tests.domains.reactor_state.test_router import receive
from tests.domains.reactor_state.test_service import build_service

URL = "/api/v1/realtime"
WS_URL = f"{URL}/ws"


@pytest.fixture
def live(monkeypatch):
    service, _, acquisition = build_service()
    runtime = ReactorRuntime(state_service=service, acquisition=acquisition, subscriber=None)
    monkeypatch.setattr(main, "build_reactor_runtime", lambda settings: runtime)
    with TestClient(app) as client:
        yield client, service, acquisition


def ws_url() -> str:
    return f"{WS_URL}?access_token={create_access_token('jperez')}"


def auth() -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token('jperez')}"}


def arrancar(client, service) -> str:
    client.portal.call(service.apply_signal, SermoSignal(sermo=True))
    return service.get_current_state().operation_id


def emitir(client, acquisition, operation_id: str, **values) -> None:
    sample = AcquiredSample(operation_id, datetime.now(UTC), values)
    client.portal.call(acquisition.emit, sample)


def expect_close(ws) -> WebSocketDisconnect:
    with pytest.raises(WebSocketDisconnect) as closed:
        ws.receive_json()
    return closed.value


# --- WebSocket ---------------------------------------------------------------


def test_conectarse_con_el_reactor_detenido_se_rechaza(live):
    """Criterio de aceptacion de la 3.2."""
    client, _, _ = live

    with client.websocket_connect(ws_url()) as ws:
        closed = expect_close(ws)

    assert closed.code == WSCloseCode.REACTOR_NOT_OPERATING


def test_con_el_reactor_operando_llegan_las_muestras_elegidas(live):
    client, service, acquisition = live
    operation_id = arrancar(client, service)

    with client.websocket_connect(ws_url()) as ws:
        assert receive(ws) == {
            "type": "subscribed",
            "data": {"operation_id": operation_id, "variables": []},
        }
        ws.send_json({"type": "subscribe", "variables": ["POTM4"]})
        assert receive(ws)["data"]["variables"] == ["POTM4"]

        emitir(client, acquisition, operation_id, potm4=5.0, loga1=1e3)
        emitir(client, acquisition, operation_id, potm4=5.1, loga1=1e3)

        primera, segunda = receive(ws), receive(ws)

    assert primera["type"] == segunda["type"] == "sample"
    assert primera["data"]["values"] == {"POTM4": 5.0}
    assert segunda["data"]["values"] == {"POTM4": 5.1}
    assert primera["data"]["operation_id"] == operation_id


def test_al_detenerse_el_reactor_el_stream_se_cierra(live):
    """Criterio de aceptacion de la 3.2: cierre ordenado, con codigo."""
    client, service, _ = live
    arrancar(client, service)

    with client.websocket_connect(ws_url()) as ws:
        receive(ws)
        client.portal.call(service.apply_signal, SermoSignal(sermo=False))

        closed = expect_close(ws)

    assert closed.code == WSCloseCode.REACTOR_NOT_OPERATING
    assert closed.reason == "La operacion termino"


def test_el_evento_sample_tiene_exactamente_la_forma_documentada(live):
    """Contrato de docs/architecture/websocket-protocol.md. Si cambia, hay
    que cambiar tambien el documento y el frontend."""
    client, service, acquisition = live
    operation_id = arrancar(client, service)

    with client.websocket_connect(ws_url()) as ws:
        receive(ws)
        ws.send_json({"type": "subscribe", "variables": ["LOGA1"]})
        receive(ws)
        emitir(client, acquisition, operation_id, loga1=1e3)
        event = receive(ws)

    assert set(event) == {"type", "data"}
    assert set(event["data"]) == {"operation_id", "timestamp", "values"}


# --- GET /realtime/status -----------------------------------------------------


def test_status_exige_sesion(live):
    client, _, _ = live

    assert client.get(f"{URL}/status").status_code == 401


def test_status_sigue_a_sermo(live):
    client, service, _ = live

    detenido = client.get(f"{URL}/status", headers=auth()).json()
    arrancar(client, service)
    operando = client.get(f"{URL}/status", headers=auth()).json()

    assert detenido["enabled"] is False
    assert detenido["reason"]
    assert operando == {"enabled": True, "reason": None}
