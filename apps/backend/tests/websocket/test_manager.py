# ConnectionManager. Los casos de falla (cliente que se corta de golpe o que
# no consume) se arman con un WebSocket falso, porque con el TestClient no hay
# forma de cortar la conexion sin el cierre ordenado. El caso feliz, en
# cambio, va de punta a punta por WebSocket.
import asyncio
import json
import time

import pytest
from fastapi import FastAPI, WebSocket, WebSocketException
from fastapi.testclient import TestClient

from app.websocket.events import WSCloseCode
from app.websocket.manager import ConnectionManager

TOPIC = "reactor.state"
OTHER_TOPIC = "realtime.samples"
MESSAGE = {"type": "state_changed", "sermo": True}


class FakeWebSocket:
    """Lo minimo de WebSocket que usa el manager."""

    def __init__(self, name: str, *, send_error: Exception | None = None, hangs: bool = False):
        self.client = name
        self.received: list[dict] = []
        self.close_code: int | None = None
        self._send_error = send_error
        self._hangs = hangs
        self._incoming: asyncio.Queue = asyncio.Queue()

    async def accept(self) -> None:
        pass

    async def send_text(self, text: str) -> None:
        if self._send_error is not None:
            raise self._send_error
        if self._hangs:
            await asyncio.Event().wait()
        self.received.append(json.loads(text))

    async def close(self, code: int = 1000, reason: str | None = None) -> None:
        self.close_code = code

    async def receive(self) -> dict:
        message = await self._incoming.get()
        if isinstance(message, Exception):
            raise message
        return message

    def push(self, message) -> None:
        self._incoming.put_nowait(message)


@pytest.fixture
def manager() -> ConnectionManager:
    return ConnectionManager(send_timeout_seconds=0.1)


async def subscribe(manager: ConnectionManager, topic: str, *sockets: FakeWebSocket) -> None:
    for websocket in sockets:
        await manager.connect(topic, websocket)


# --- broadcast ---------------------------------------------------------------


async def test_broadcast_llega_solo_a_los_suscriptos_del_topico(manager):
    a, b, ajeno = FakeWebSocket("a"), FakeWebSocket("b"), FakeWebSocket("ajeno")
    await subscribe(manager, TOPIC, a, b)
    await subscribe(manager, OTHER_TOPIC, ajeno)

    await manager.broadcast(TOPIC, MESSAGE)

    assert a.received == [MESSAGE]
    assert b.received == [MESSAGE]
    assert ajeno.received == []


async def test_broadcast_a_un_topico_sin_suscriptos_no_hace_nada(manager):
    await manager.broadcast(TOPIC, MESSAGE)


async def test_un_cliente_caido_no_corta_el_broadcast_a_los_demas(manager):
    """Criterio de aceptacion de la 2.3. Antes, la excepcion del socket
    muerto cortaba el for y los que venian despues no recibian nada."""
    sano_1 = FakeWebSocket("sano-1")
    caido = FakeWebSocket("caido", send_error=ConnectionResetError())
    sano_2 = FakeWebSocket("sano-2")
    await subscribe(manager, TOPIC, sano_1, caido, sano_2)

    await manager.broadcast(TOPIC, MESSAGE)

    assert sano_1.received == [MESSAGE]
    assert sano_2.received == [MESSAGE]
    # Y no queda huerfano: el proximo broadcast ya no lo intenta.
    assert manager.subscriber_count(TOPIC) == 2


async def test_un_cliente_caido_se_descarta_de_todos_sus_topicos(manager):
    caido = FakeWebSocket("caido", send_error=RuntimeError("socket cerrado"))
    await subscribe(manager, TOPIC, caido)
    await subscribe(manager, OTHER_TOPIC, caido)

    await manager.broadcast(TOPIC, MESSAGE)

    assert manager.subscriber_count(TOPIC) == 0
    assert manager.subscriber_count(OTHER_TOPIC) == 0


async def test_un_cliente_lento_no_demora_a_los_demas_y_se_descarta(manager):
    rapido = FakeWebSocket("rapido")
    lento = FakeWebSocket("lento", hangs=True)
    await subscribe(manager, TOPIC, lento, rapido)

    # Si los envios fueran en serie, esto no terminaria nunca.
    await asyncio.wait_for(manager.broadcast(TOPIC, MESSAGE), timeout=1)

    assert rapido.received == [MESSAGE]
    assert manager.subscriber_count(TOPIC) == 1
    # Al lento se le avisa por que se lo corta: puede reconectar.
    assert lento.close_code == WSCloseCode.TRY_AGAIN_LATER


async def test_un_mensaje_no_serializable_no_desconecta_a_nadie(manager):
    """El error es de quien publica, no de los clientes."""
    a = FakeWebSocket("a")
    await subscribe(manager, TOPIC, a)

    with pytest.raises(TypeError):
        await manager.broadcast(TOPIC, {"valor": object()})

    assert manager.subscriber_count(TOPIC) == 1


# --- disconnect --------------------------------------------------------------


async def test_desconectar_un_cliente_no_afecta_al_resto(manager):
    """Criterio de aceptacion de la 2.3."""
    a, b = FakeWebSocket("a"), FakeWebSocket("b")
    await subscribe(manager, TOPIC, a, b)

    manager.disconnect(TOPIC, a)
    await manager.broadcast(TOPIC, MESSAGE)

    assert a.received == []
    assert b.received == [MESSAGE]


async def test_disconnect_es_idempotente_y_limpia_topicos_vacios(manager):
    a = FakeWebSocket("a")
    await subscribe(manager, TOPIC, a)

    manager.disconnect(TOPIC, a)
    manager.disconnect(TOPIC, a)
    manager.disconnect("topico-inexistente", a)

    assert manager.subscriber_count(TOPIC) == 0
    # Sin topicos vacios acumulandose (se mira el estado interno a proposito:
    # es justamente lo que no tiene que crecer).
    assert manager._connections == {}


# --- serve -------------------------------------------------------------------


async def test_serve_desuscribe_cuando_el_cliente_se_va(manager):
    a = FakeWebSocket("a")
    task = asyncio.create_task(manager.serve(TOPIC, a))
    await asyncio.sleep(0)
    assert manager.subscriber_count(TOPIC) == 1

    # Lo que mande el cliente se ignora: el canal es de solo bajada.
    a.push({"type": "websocket.receive", "text": "hola"})
    a.push({"type": "websocket.disconnect", "code": 1006})
    await asyncio.wait_for(task, timeout=1)

    assert manager.subscriber_count(TOPIC) == 0


async def test_serve_desuscribe_aunque_la_conexion_falle(manager):
    a = FakeWebSocket("a")
    task = asyncio.create_task(manager.serve(TOPIC, a))
    await asyncio.sleep(0)

    a.push(OSError("conexion reseteada"))
    with pytest.raises(OSError):
        await asyncio.wait_for(task, timeout=1)

    assert manager.subscriber_count(TOPIC) == 0


# --- Mensaje inicial ---------------------------------------------------------

INITIAL = {"type": "state_changed", "sermo": False}


async def test_el_mensaje_inicial_es_lo_primero_que_recibe(manager):
    a = FakeWebSocket("a")

    await manager.connect(TOPIC, a, initial_message=lambda: INITIAL)
    await manager.broadcast(TOPIC, MESSAGE)

    assert a.received == [INITIAL, MESSAGE]


async def test_el_mensaje_inicial_se_arma_al_suscribir_y_no_antes(manager):
    """Si se armara al pedir la conexion, un cambio ocurrido mientras se
    acepta no estaria en el mensaje inicial ni llegaria por broadcast (el
    cliente todavia no estaba suscripto): el cliente se lo perderia."""
    estado = {"sermo": False}
    aceptando = asyncio.Event()
    seguir = asyncio.Event()

    class SlowAccept(FakeWebSocket):
        async def accept(self) -> None:
            aceptando.set()
            await seguir.wait()

    a = SlowAccept("a")
    task = asyncio.create_task(
        manager.connect(TOPIC, a, initial_message=lambda: {"sermo": estado["sermo"]})
    )
    await aceptando.wait()
    # El cambio ocurre en medio del handshake; su broadcast no encuentra a
    # nadie suscripto todavia.
    estado["sermo"] = True
    await manager.broadcast(TOPIC, {"sermo": True})
    seguir.set()
    await task

    assert a.received == [{"sermo": True}]


async def test_sin_mensaje_inicial_no_se_envia_nada(manager):
    a = FakeWebSocket("a")

    await manager.connect(TOPIC, a)

    assert a.received == []
    assert manager.subscriber_count(TOPIC) == 1


async def test_si_el_mensaje_inicial_no_llega_no_queda_suscripto(manager):
    caido = FakeWebSocket("caido", send_error=ConnectionResetError())

    await manager.connect(TOPIC, caido, initial_message=lambda: INITIAL)

    assert manager.subscriber_count(TOPIC) == 0


async def test_serve_manda_el_mensaje_inicial(manager):
    a = FakeWebSocket("a")
    task = asyncio.create_task(manager.serve(TOPIC, a, initial_message=lambda: INITIAL))
    await asyncio.sleep(0)

    assert a.received == [INITIAL]

    a.push({"type": "websocket.disconnect", "code": 1000})
    await asyncio.wait_for(task, timeout=1)


# --- Mensajes del cliente (on_text) -----------------------------------------


async def test_serve_entrega_los_textos_del_cliente_en_orden(manager):
    a = FakeWebSocket("a")
    recibidos = []

    async def on_text(text: str) -> None:
        recibidos.append(text)

    task = asyncio.create_task(manager.serve(TOPIC, a, on_text=on_text))
    a.push({"type": "websocket.receive", "text": "uno"})
    a.push({"type": "websocket.receive", "bytes": b"binario"})
    a.push({"type": "websocket.receive", "text": "dos"})
    a.push({"type": "websocket.disconnect", "code": 1000})
    await asyncio.wait_for(task, timeout=1)

    # Los binarios se descartan: ningun topico los usa.
    assert recibidos == ["uno", "dos"]


# --- Rechazo en el mensaje inicial -------------------------------------------


async def test_un_mensaje_inicial_que_rechaza_no_suscribe(manager):
    """realtime.samples rechaza asi con el reactor detenido: la excepcion
    sale de connect() y el handler de core/exceptions.py cierra."""
    a = FakeWebSocket("a")

    def rechazar() -> dict:
        raise WebSocketException(code=4409, reason="no")

    with pytest.raises(WebSocketException):
        await manager.connect(TOPIC, a, initial_message=rechazar)

    assert manager.subscriber_count(TOPIC) == 0
    assert a.received == []


# --- broadcast_each ----------------------------------------------------------


async def test_broadcast_each_manda_a_cada_uno_lo_suyo(manager):
    a, b, nadie = FakeWebSocket("a"), FakeWebSocket("b"), FakeWebSocket("nadie")
    await subscribe(manager, TOPIC, a, b, nadie)
    mensajes = {a: {"para": "a"}, b: {"para": "b"}}

    await manager.broadcast_each(TOPIC, mensajes.get)

    assert a.received == [{"para": "a"}]
    assert b.received == [{"para": "b"}]
    assert nadie.received == []


async def test_broadcast_each_serializa_una_vez_por_mensaje(manager, monkeypatch):
    from app.websocket import manager as manager_module

    serializados = []
    original = manager_module._serialize

    def contar(message):
        serializados.append(message)
        return original(message)

    monkeypatch.setattr(manager_module, "_serialize", contar)
    sockets = [FakeWebSocket(str(i)) for i in range(5)]
    await subscribe(manager, TOPIC, *sockets)
    compartido = {"type": "sample"}

    await manager.broadcast_each(TOPIC, lambda websocket: compartido)

    assert len(serializados) == 1
    assert all(ws.received == [compartido] for ws in sockets)


async def test_broadcast_each_descarta_al_cliente_caido_sin_cortar_al_resto(manager):
    sano = FakeWebSocket("sano")
    caido = FakeWebSocket("caido", send_error=ConnectionResetError())
    await subscribe(manager, TOPIC, sano, caido)

    await manager.broadcast_each(TOPIC, lambda websocket: MESSAGE)

    assert sano.received == [MESSAGE]
    assert manager.subscriber_count(TOPIC) == 1


# --- close_topic / send -------------------------------------------------------


async def test_close_topic_cierra_y_desuscribe_a_todos_los_del_topico(manager):
    a, b, ajeno = FakeWebSocket("a"), FakeWebSocket("b"), FakeWebSocket("ajeno")
    await subscribe(manager, TOPIC, a, b)
    await subscribe(manager, OTHER_TOPIC, ajeno)

    await manager.close_topic(TOPIC, 4409, "fin")

    assert (a.close_code, b.close_code) == (4409, 4409)
    assert ajeno.close_code is None
    assert manager.subscriber_count(TOPIC) == 0
    assert manager.subscriber_count(OTHER_TOPIC) == 1


async def test_close_topic_no_espera_a_un_cliente_que_no_acepta_el_cierre(manager):
    class NoCierra(FakeWebSocket):
        async def close(self, code: int = 1000, reason: str | None = None) -> None:
            await asyncio.Event().wait()

    colgado, normal = NoCierra("colgado"), FakeWebSocket("normal")
    await subscribe(manager, TOPIC, colgado, normal)

    await asyncio.wait_for(manager.close_topic(TOPIC, 4409, "fin"), timeout=1)

    assert normal.close_code == 4409


async def test_send_le_llega_solo_a_ese_cliente(manager):
    a, b = FakeWebSocket("a"), FakeWebSocket("b")
    await subscribe(manager, TOPIC, a, b)

    await manager.send(a, MESSAGE)

    assert a.received == [MESSAGE]
    assert b.received == []


# --- De punta a punta --------------------------------------------------------


def test_dos_clientes_reales_uno_se_va_y_el_otro_sigue_recibiendo():
    manager = ConnectionManager()
    app = FastAPI()

    @app.websocket("/ws")
    async def subscribe_ws(websocket: WebSocket):
        await manager.serve(TOPIC, websocket)

    @app.post("/publish")
    async def publish():
        await manager.broadcast(TOPIC, MESSAGE)

    # Con `with`, todas las conexiones comparten el event loop del TestClient,
    # igual que en el servidor real.
    with TestClient(app) as client, client.websocket_connect("/ws") as que_sigue:
        with client.websocket_connect("/ws"):
            wait_until(lambda: manager.subscriber_count(TOPIC) == 2)
        wait_until(lambda: manager.subscriber_count(TOPIC) == 1)

        client.post("/publish")

        assert que_sigue.receive_json() == MESSAGE


def wait_until(condition, timeout: float = 2.0) -> None:
    """El registro ocurre en el loop del TestClient, no en el del test."""
    deadline = time.monotonic() + timeout
    while not condition():
        assert time.monotonic() < deadline, "la condicion no se cumplio a tiempo"
        time.sleep(0.01)
