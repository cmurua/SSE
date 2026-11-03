# RealtimeService: el gating por SERMO (RF04) y el recorte de cada muestra a
# las variables que eligio el cliente. Con el ConnectionManager real y
# sockets falsos: lo que se verifica es que mensaje le llega a quien, sin
# depender del TestClient. El protocolo de punta a punta esta en
# test_router.py.
import asyncio
import json
from datetime import UTC, datetime

import pytest
from fastapi import WebSocketException

from app.domains.reactor_data.acquisition import AcquiredSample
from app.domains.reactor_state.schemas import ReactorState
from app.domains.realtime.service import RealtimeService
from app.websocket.events import WSCloseCode
from app.websocket.manager import ConnectionManager
from tests.websocket.test_manager import FakeWebSocket

TOPIC = "realtime.samples"
OPERATION = "OP-TEST-001"


class FakeReactorState:
    def __init__(self, sermo: bool = True) -> None:
        self.sermo = sermo

    def get_current_state(self) -> ReactorState:
        return ReactorState.build(
            sermo=self.sermo,
            updated_at=datetime.now(UTC),
            operation_id=OPERATION if self.sermo else None,
        )


@pytest.fixture
def state() -> FakeReactorState:
    return FakeReactorState()


@pytest.fixture
def manager() -> ConnectionManager:
    return ConnectionManager(send_timeout_seconds=0.1)


@pytest.fixture
def service(state, manager) -> RealtimeService:
    return RealtimeService(reactor_state=state, manager=manager)


def sample(**values) -> AcquiredSample:
    # Claves por columna, como las guarda la toma de datos (loga1, potm4...).
    return AcquiredSample(OPERATION, datetime(2026, 11, 3, 12, 0, tzinfo=UTC), values)


async def connect(service: RealtimeService, name: str = "a") -> tuple[FakeWebSocket, asyncio.Task]:
    websocket = FakeWebSocket(name)
    task = asyncio.create_task(service.serve(websocket))
    await asyncio.sleep(0)
    return websocket, task


async def send(service, websocket: FakeWebSocket, message) -> None:
    text = message if isinstance(message, str) else json.dumps(message)
    websocket.push({"type": "websocket.receive", "text": text})
    # Hasta que el servicio lo proceso y respondio.
    before = len(websocket.received)
    for _ in range(100):
        await asyncio.sleep(0)
        if len(websocket.received) > before:
            return
    raise AssertionError("el servicio no respondio")


def subscribe(*variables: str) -> dict:
    return {"type": "subscribe", "variables": list(variables)}


async def disconnect(websocket: FakeWebSocket, task: asyncio.Task) -> None:
    websocket.push({"type": "websocket.disconnect", "code": 1000})
    await asyncio.wait_for(task, timeout=1)


# --- Gating por SERMO --------------------------------------------------------


async def test_con_el_reactor_detenido_se_rechaza_sin_suscribir(state, service, manager):
    state.sermo = False

    with pytest.raises(WebSocketException) as rejected:
        await service.serve(FakeWebSocket("a"))

    assert rejected.value.code == WSCloseCode.REACTOR_NOT_OPERATING
    assert manager.subscriber_count(TOPIC) == 0


async def test_al_conectarse_recibe_la_operacion_y_ninguna_variable(service):
    a, task = await connect(service)

    assert a.received == [
        {"type": "subscribed", "data": {"operation_id": OPERATION, "variables": []}}
    ]
    await disconnect(a, task)


async def test_al_terminar_la_operacion_cierra_todos_los_streams(state, service, manager):
    a, task_a = await connect(service, "a")
    b, task_b = await connect(service, "b")

    state.sermo = False
    await service.on_state_changed(state.get_current_state())

    assert a.close_code == b.close_code == WSCloseCode.REACTOR_NOT_OPERATING
    assert manager.subscriber_count(TOPIC) == 0
    await disconnect(a, task_a)
    await disconnect(b, task_b)


async def test_perder_la_senal_no_corta_el_stream(state, service, manager):
    a, task = await connect(service)

    perdida = ReactorState.build(
        sermo=True, updated_at=datetime.now(UTC), operation_id=OPERATION, source_connected=False
    )
    await service.on_state_changed(perdida)

    assert a.close_code is None
    assert manager.subscriber_count(TOPIC) == 1
    await disconnect(a, task)


# --- Seleccion de variables ----------------------------------------------------


async def test_recibe_solo_las_variables_que_eligio(service):
    a, task = await connect(service)
    await send(service, a, subscribe("LOGA1", "POTM4"))

    await service.publish_sample(sample(loga1=1000.0, potm4=5.2, reactm4=12.0))

    assert a.received[-2] == {
        "type": "subscribed",
        "data": {"operation_id": OPERATION, "variables": ["LOGA1", "POTM4"]},
    }
    assert a.received[-1] == {
        "type": "sample",
        "data": {
            "operation_id": OPERATION,
            "timestamp": "2026-11-03T12:00:00Z",
            "values": {"LOGA1": 1000.0, "POTM4": 5.2},
        },
    }
    await disconnect(a, task)


async def test_sin_variables_elegidas_no_recibe_muestras(service):
    a, task = await connect(service)

    await service.publish_sample(sample(loga1=1.0))

    assert [m["type"] for m in a.received] == ["subscribed"]
    await disconnect(a, task)


async def test_cada_cliente_recibe_su_propia_seleccion(service):
    a, task_a = await connect(service, "a")
    b, task_b = await connect(service, "b")
    await send(service, a, subscribe("LOGA1"))
    await send(service, b, subscribe("POTM4"))

    await service.publish_sample(sample(loga1=1.0, potm4=2.0))

    assert a.received[-1]["data"]["values"] == {"LOGA1": 1.0}
    assert b.received[-1]["data"]["values"] == {"POTM4": 2.0}
    await disconnect(a, task_a)
    await disconnect(b, task_b)


async def test_cambiar_la_seleccion_no_corta_la_conexion(service, manager):
    """Criterio de la 3.3: suscribir y desuscribir sin reconectar."""
    a, task = await connect(service)
    await send(service, a, subscribe("LOGA1"))
    await send(service, a, subscribe("POTM4"))

    await service.publish_sample(sample(loga1=1.0, potm4=2.0))

    assert a.received[-1]["data"]["values"] == {"POTM4": 2.0}
    assert manager.subscriber_count(TOPIC) == 1
    await disconnect(a, task)


async def test_una_lista_vacia_deja_de_recibir_sin_desconectar(service, manager):
    a, task = await connect(service)
    await send(service, a, subscribe("LOGA1"))
    await send(service, a, subscribe())

    await service.publish_sample(sample(loga1=1.0))

    assert a.received[-1]["type"] == "subscribed"
    assert manager.subscriber_count(TOPIC) == 1
    await disconnect(a, task)


async def test_un_canal_sin_dato_llega_como_null(service):
    a, task = await connect(service)
    await send(service, a, subscribe("LOGA1"))

    await service.publish_sample(sample(loga1=None))

    assert a.received[-1]["data"]["values"] == {"LOGA1": None}
    await disconnect(a, task)


async def test_las_variables_repetidas_cuentan_una_vez(service):
    a, task = await connect(service)

    await send(service, a, subscribe("LOGA1", "LOGA1", "POTM4"))

    assert a.received[-1]["data"]["variables"] == ["LOGA1", "POTM4"]
    await disconnect(a, task)


# --- Pedidos invalidos: error y la seleccion anterior sigue ---------------------


@pytest.mark.parametrize(
    ("message", "code"),
    [
        ("no es json", "invalid_message"),
        ({"type": "otra_cosa"}, "invalid_message"),
        ({"type": "subscribe", "variables": "LOGA1"}, "invalid_message"),
        (subscribe("NO_EXISTE"), "unknown_variable"),
        (subscribe("LOGA1", "POTM4", "REACTM4"), "too_many_variables"),
    ],
)
async def test_un_pedido_invalido_responde_error_y_conserva_la_seleccion(
    service, message, code
):
    a, task = await connect(service)
    await send(service, a, subscribe("LOGA1"))

    await send(service, a, message)
    await service.publish_sample(sample(loga1=1.0))

    error = a.received[-2]
    assert error["type"] == "error"
    assert error["data"]["code"] == code
    assert error["data"]["message"]
    assert a.received[-1]["data"]["values"] == {"LOGA1": 1.0}
    await disconnect(a, task)


async def test_al_irse_el_cliente_se_olvida_su_seleccion(service):
    a, task = await connect(service)
    await send(service, a, subscribe("LOGA1"))

    await disconnect(a, task)

    assert service.subscription_of(a) == ()


# --- GET /realtime/status -----------------------------------------------------


def test_status_refleja_sermo(state, service):
    assert service.get_status().enabled is True

    state.sermo = False

    status = service.get_status()
    assert status.enabled is False
    assert status.reason
