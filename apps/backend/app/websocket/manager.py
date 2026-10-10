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
from collections.abc import Callable

from fastapi import WebSocket

from app.websocket.events import WSCloseCode

logger = logging.getLogger(__name__)

# Arma el primer mensaje de una conexion. Es una funcion y no el mensaje ya
# armado porque tiene que evaluarse en el momento de suscribir (ver connect).
InitialMessage = Callable[[], dict]


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
    ) -> None:
        """Suscribe y mantiene la conexion hasta que el cliente se va.

        Es la forma recomendada de atender un WebSocket de solo bajada (el
        servidor publica, el cliente escucha): garantiza la desuscripcion
        aunque el cliente se corte de golpe. Los mensajes que mande el cliente
        se descartan.

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
        finally:
            self.disconnect(topic, websocket)

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
        # Best-effort: el cliente lento sigue conectado y conviene avisarle por
        # que se lo corta, pero si tampoco acepta el cierre no se lo espera.
        with contextlib.suppress(Exception):
            async with asyncio.timeout(self._send_timeout_seconds):
                await websocket.close(code=close_code, reason="Cliente demasiado lento")


def _serialize(message: dict) -> str:
    # Mismo formato que WebSocket.send_json() de Starlette.
    return json.dumps(message, separators=(",", ":"), ensure_ascii=False)


manager = ConnectionManager()
