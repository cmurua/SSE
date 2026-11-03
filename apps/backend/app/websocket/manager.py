# Registro de conexiones WebSocket activas y utilidades de broadcast por topico.
# Los dominios (realtime, reactor_state) publican eventos aca; este modulo no
# sabe nada de reactor ni de negocio, solo de conexiones y topicos.
#
# Invariante: un socket que ya no puede recibir no queda registrado. Se cumple
# por dos caminos, porque ninguno alcanza solo:
#   - serve() desregistra siempre al salir, cierre limpio o abrupto.
#   - broadcast() descarta a quien falle o no consuma a tiempo, por si el
#     socket murio sin que su endpoint se enterara todavia.
import asyncio
import contextlib
import json
import logging
from collections.abc import Awaitable, Callable

from fastapi import WebSocket

from app.websocket.events import WSCloseCode

logger = logging.getLogger(__name__)

# Arma el primer mensaje de una conexion. Es una funcion y no el mensaje ya
# armado porque tiene que evaluarse en el momento de suscribir (ver connect).
InitialMessage = Callable[[], dict]
# Atiende un mensaje de texto que mando el cliente (ver serve).
TextHandler = Callable[[str], Awaitable[None]]
# Decide que recibe cada suscriptor; None = nada (ver broadcast_each).
MessageFor = Callable[[WebSocket], dict | None]


class ConnectionManager:
    def __init__(self, send_timeout_seconds: float = 5.0) -> None:
        self._connections: dict[str, set[WebSocket]] = {}
        # Tope para entregar un mensaje a UN cliente. Los envios van en
        # paralelo, asi que un cliente lento no demora a los demas; este tope
        # evita ademas que se le acumulen mensajes sin limite.
        self._send_timeout_seconds = send_timeout_seconds

    async def connect(
        self,
        topic: str,
        websocket: WebSocket,
        initial_message: InitialMessage | None = None,
    ) -> None:
        """Acepta la conexion y la suscribe al topico.

        Se llama recien despues de autenticar (ver websocket/dependencies.py):
        aceptar es lo ultimo, no lo primero.

        `initial_message`, si se pasa, es lo primero que recibe el cliente: lo
        usa reactor.state para mandar el estado actual sin esperar al primer
        cambio. Se evalua y se suscribe en el mismo paso, sin ceder el event
        loop entre uno y otro, para que no se pierda un cambio:
          - un cambio anterior ya esta en el mensaje inicial;
          - uno posterior encuentra al cliente suscripto y le llega por
            broadcast, despues del inicial porque ese envio arranco antes.
        Lo peor que puede pasar es recibir el mismo estado dos veces, y por
        eso cada evento lleva el estado completo y no la diferencia.

        `initial_message` tambien puede RECHAZAR la conexion lanzando
        WebSocketException: la excepcion sale de aca sin suscribir al cliente
        y el handler de core/exceptions.py cierra con su codigo. Lo usa
        realtime.samples para no admitir clientes con el reactor detenido;
        decidirlo en este mismo paso, y no antes de aceptar, evita que un
        cliente quede suscripto a una operacion que termino mientras se
        aceptaba la conexion.
        """
        await websocket.accept()
        text = None if initial_message is None else _serialize(initial_message())
        self._connections.setdefault(topic, set()).add(websocket)
        if text is not None:
            # Por el mismo camino que un broadcast: si el cliente no lo puede
            # recibir, se lo descarta y no queda suscripto.
            await self._send(websocket, text)

    def disconnect(self, topic: str, websocket: WebSocket) -> None:
        """Desuscribe del topico. Idempotente."""
        subscribers = self._connections.get(topic)
        if subscribers is None:
            return
        subscribers.discard(websocket)
        if not subscribers:
            del self._connections[topic]

    def subscriber_count(self, topic: str) -> int:
        return len(self._connections.get(topic, ()))

    async def serve(
        self,
        topic: str,
        websocket: WebSocket,
        initial_message: InitialMessage | None = None,
        on_text: TextHandler | None = None,
    ) -> None:
        """Suscribe y mantiene la conexion hasta que el cliente se va.

        Es la forma recomendada de atender un WebSocket: garantiza la
        desuscripcion aunque el cliente se corte de golpe.

        Los mensajes de texto del cliente van a `on_text`, en orden y de a
        uno: el siguiente no se lee hasta que termina el anterior. Sin
        `on_text` el canal es de solo bajada y se descartan. Los binarios se
        descartan siempre: ningun topico los usa.

        Una caida de red sin cierre (TCP medio abierto) tambien termina aca:
        uvicorn hace ping/pong cada 20 s y, si no hay respuesta, entrega el
        websocket.disconnect.
        """
        await self.connect(topic, websocket, initial_message)
        try:
            while True:
                message = await websocket.receive()
                if message["type"] == "websocket.disconnect":
                    return
                text = message.get("text")
                if on_text is not None and text is not None:
                    await on_text(text)
        finally:
            self.disconnect(topic, websocket)

    async def send(self, websocket: WebSocket, message: dict) -> None:
        """Envia `message` a UN cliente, p. ej. la respuesta a algo que pidio.

        Mismas reglas que un broadcast: se serializa antes de enviar y si el
        cliente falla o no consume a tiempo, se lo descarta.
        """
        await self._send(websocket, _serialize(message))

    async def broadcast(self, topic: str, message: dict) -> None:
        """Envia `message` a todos los suscriptos del topico.

        Un suscripto que falla o no consume a tiempo se descarta sin afectar
        la entrega al resto.

        `message` tiene que ser serializable a JSON (p. ej.
        `model_dump(mode="json")`). Se serializa una sola vez y antes de
        enviar: un mensaje mal armado es un error del que publica, y no debe
        confundirse con un cliente caido ni desconectar a nadie.
        """
        subscribers = list(self._connections.get(topic, ()))
        if not subscribers:
            return
        text = _serialize(message)
        await asyncio.gather(*(self._send(websocket, text) for websocket in subscribers))

    async def broadcast_each(self, topic: str, message_for: MessageFor) -> None:
        """Como broadcast(), pero cada suscriptor puede recibir algo distinto.

        `message_for(websocket)` devuelve el mensaje de ese suscriptor, o None
        para no mandarle nada. Lo usa realtime.samples, donde cada cliente
        recibe solo las variables que eligio.

        Cada mensaje distinto se serializa una sola vez: si `message_for`
        devuelve el MISMO objeto para varios suscriptores (por ejemplo,
        cacheado por seleccion de variables), se comparte el texto. Igual que
        en broadcast(), todo se arma antes de enviar, asi que un mensaje mal
        armado falla sin desconectar a nadie.
        """
        subscribers = list(self._connections.get(topic, ()))
        if not subscribers:
            return
        # Por identidad: dos selecciones distintas pueden dar dicts iguales,
        # pero lo comun es que el que publica ya reuse el objeto. Los mensajes
        # quedan referenciados en `texts` mientras dura el envio, asi que un
        # id() no puede reciclarse en el medio.
        texts: dict[int, tuple[dict, str]] = {}
        sends = []
        for websocket in subscribers:
            message = message_for(websocket)
            if message is None:
                continue
            cached = texts.get(id(message))
            if cached is None:
                cached = texts[id(message)] = (message, _serialize(message))
            sends.append(self._send(websocket, cached[1]))
        await asyncio.gather(*sends)

    async def close_topic(self, topic: str, code: int, reason: str) -> None:
        """Desuscribe y cierra a todos los suscriptos del topico.

        Para cuando el topico deja de tener sentido para todos a la vez (p.
        ej. termino la operacion que alimentaba realtime.samples). El cierre
        es best-effort y en paralelo, con el mismo tope que un envio: un
        cliente que no lo acepta no demora a los demas.
        """
        subscribers = list(self._connections.pop(topic, ()))
        await asyncio.gather(
            *(self._close(websocket, code, reason) for websocket in subscribers)
        )

    async def _send(self, websocket: WebSocket, text: str) -> None:
        try:
            async with asyncio.timeout(self._send_timeout_seconds):
                await websocket.send_text(text)
        except TimeoutError:
            logger.info("Cliente WebSocket %s descartado: no consumia a tiempo", websocket.client)
            await self._drop(websocket, close_code=WSCloseCode.TRY_AGAIN_LATER)
        except Exception as error:  # noqa: BLE001 -- ver comentario
            # Cualquier otra falla al enviar es de transporte (el mensaje ya se
            # serializo): WebSocketDisconnect, ClientDisconnected de uvicorn,
            # ConnectionClosed de websockets, OSError... Todas significan lo
            # mismo, el socket no sirve mas, y ninguna puede cortar el
            # broadcast a los demas.
            logger.info(
                "Cliente WebSocket %s descartado: %s", websocket.client, type(error).__name__
            )
            await self._drop(websocket)

    async def _drop(self, websocket: WebSocket, close_code: int | None = None) -> None:
        # Copia de las claves: disconnect() borra los topicos que quedan vacios
        # y modificar un dict mientras se lo recorre es un RuntimeError.
        for topic in tuple(self._connections):
            self.disconnect(topic, websocket)

        if close_code is None:
            return
        # El cliente lento sigue conectado y conviene avisarle por que se lo
        # corta.
        await self._close(websocket, close_code, "Cliente demasiado lento")

    async def _close(self, websocket: WebSocket, code: int, reason: str) -> None:
        # Best-effort: si el cliente tampoco acepta el cierre no se lo espera.
        with contextlib.suppress(Exception):
            async with asyncio.timeout(self._send_timeout_seconds):
                await websocket.close(code=code, reason=reason)


def _serialize(message: dict) -> str:
    # Mismo formato que WebSocket.send_json() de Starlette.
    return json.dumps(message, separators=(",", ":"), ensure_ascii=False)


manager = ConnectionManager()
