# RealtimeService: el gating por SERMO (RF04), el recorte de cada muestra a
# las variables que eligio el cliente y las que se mandan siempre (barras de
# control, tarea 5.4). Con el ConnectionManager real y
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
from app.domains.reactor_data.variable_catalog import REACTOR_VARIABLES_BY_ID
from app.domains.realtime.service import ALWAYS_SENT_VARIABLES, RealtimeService
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
    # Sin variables fijas, para que estos tests vean solo la seleccion. Las
    # que se mandan siempre se prueban aparte, con `service_sbc`.
    return RealtimeService(reactor_state=state, manager=manager, always_sent=())


@pytest.fixture
def service_sbc(state, manager) -> RealtimeService:
    """Con la configuracion por defecto: las barras viajan siempre."""
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
        {
            "type": "subscribed",
            "data": {"operation_id": OPERATION, "variables": [], "always_variables": []},
        }
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
        "data": {
            "operation_id": OPERATION,
            "variables": ["LOGA1", "POTM4"],
            "always_variables": [],
        },
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


# --- Variables que se mandan siempre (panel del nucleo) -------------------------

BARRAS = {"posbc1": 10.0, "posbc2": 20.0, "posbc3": 30.0, "posbc4": 40.0, "nn1": 98.0}
BARRAS_POR_ID = {"POSBC1": 10.0, "POSBC2": 20.0, "POSBC3": 30.0, "POSBC4": 40.0, "NN1": 98.0}
FIJAS = ["POSBC1", "POSBC2", "POSBC3", "POSBC4", "NN1"]


def test_se_mandan_siempre_las_barras_del_grupo_sbc_y_el_nivel_de_moderador():
    assert list(ALWAYS_SENT_VARIABLES) == FIJAS
    assert all(variable in REACTOR_VARIABLES_BY_ID for variable in ALWAYS_SENT_VARIABLES)


async def test_al_conectarse_informa_las_variables_que_llegan_siempre(service_sbc):
    a, task = await connect(service_sbc)

    assert a.received[0]["data"]["always_variables"] == list(ALWAYS_SENT_VARIABLES)
    await disconnect(a, task)


async def test_sin_variables_elegidas_igual_recibe_las_barras(service_sbc):
    a, task = await connect(service_sbc)

    await service_sbc.publish_sample(sample(loga1=1.0, **BARRAS))

    assert a.received[-1]["type"] == "sample"
    assert a.received[-1]["data"]["values"] == BARRAS_POR_ID
    await disconnect(a, task)


async def test_las_barras_llegan_ademas_de_la_seleccion_y_despues_de_ella(service_sbc):
    a, task = await connect(service_sbc)
    await send(service_sbc, a, subscribe("LOGA1", "POTM4"))

    await service_sbc.publish_sample(sample(loga1=1.0, potm4=2.0, reactm4=3.0, **BARRAS))

    values = a.received[-1]["data"]["values"]
    assert values == {"LOGA1": 1.0, "POTM4": 2.0, **BARRAS_POR_ID}
    assert list(values)[:2] == ["LOGA1", "POTM4"]
    await disconnect(a, task)


async def test_cada_cliente_recibe_los_valores_en_el_orden_de_su_seleccion(service_sbc):
    # {POTM4 + barras} y {POSBC1, POTM4 + barras} son el mismo conjunto: el
    # mensaje armado para uno no tiene que reutilizarse para el otro.
    a, task_a = await connect(service_sbc, "a")
    b, task_b = await connect(service_sbc, "b")
    await send(service_sbc, a, subscribe("POTM4"))
    await send(service_sbc, b, subscribe("POSBC1", "POTM4"))

    await service_sbc.publish_sample(sample(potm4=2.0, **BARRAS))

    assert list(a.received[-1]["data"]["values"]) == ["POTM4", *FIJAS]
    assert list(b.received[-1]["data"]["values"]) == [
        "POSBC1", "POTM4", "POSBC2", "POSBC3", "POSBC4", "NN1"
    ]
    await disconnect(a, task_a)
    await disconnect(b, task_b)


async def test_las_barras_no_cuentan_en_el_tope_de_dos(service_sbc):
    a, task = await connect(service_sbc)

    await send(service_sbc, a, subscribe("LOGA1", "POTM4"))

    assert a.received[-1]["type"] == "subscribed"
    assert a.received[-1]["data"]["variables"] == ["LOGA1", "POTM4"]
    await disconnect(a, task)


async def test_elegir_una_barra_para_el_grafico_no_la_repite(service_sbc):
    a, task = await connect(service_sbc)
    await send(service_sbc, a, subscribe("POSBC1"))

    await service_sbc.publish_sample(sample(**BARRAS))

    assert a.received[-1]["data"]["values"] == BARRAS_POR_ID
    await disconnect(a, task)


async def test_una_barra_sin_dato_llega_como_null(service_sbc):
    a, task = await connect(service_sbc)

    await service_sbc.publish_sample(sample(posbc1=5.0))

    assert a.received[-1]["data"]["values"] == {
        "POSBC1": 5.0,
        "POSBC2": None,
        "POSBC3": None,
        "POSBC4": None,
        "NN1": None,
    }
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
