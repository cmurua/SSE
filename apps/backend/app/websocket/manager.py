# Registro de conexiones WebSocket activas y utilidades de broadcast por topico.
# Los dominios (realtime, reactor_state) publican eventos aca; este modulo no
# sabe nada de reactor ni de negocio, solo de conexiones y topicos.
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = {}

    async def connect(self, topic: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.setdefault(topic, set()).add(websocket)

    def disconnect(self, topic: str, websocket: WebSocket) -> None:
        self._connections.get(topic, set()).discard(websocket)

    async def broadcast(self, topic: str, message: dict) -> None:
        for ws in list(self._connections.get(topic, set())):
            await ws.send_json(message)


manager = ConnectionManager()
