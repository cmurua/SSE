# GET /realtime/status (REST) + WS /realtime/ws (topico realtime.samples).
# Habilitado solo cuando reactor_state.sermo == True (RF04). Latencia
# maxima objetivo: RNF01 (<= 2s).
#
# El contrato del WebSocket -- seleccion de variables, forma de cada evento y
# codigos de cierre -- esta en docs/architecture/websocket-protocol.md.
from typing import Annotated

from fastapi import APIRouter, Depends, WebSocket
from fastapi.requests import HTTPConnection

from app.domains.auth.dependencies import CurrentUser
from app.domains.realtime.schemas import RealtimeStatus
from app.domains.realtime.service import RealtimeService
from app.websocket.dependencies import CurrentUserWS

router = APIRouter()


def get_realtime_service(connection: HTTPConnection) -> RealtimeService:
    """El servicio que armo el lifespan (app/main.py).

    Mismo criterio que get_reactor_state_service(): NO construir otro, porque
    las selecciones de cada cliente viven en esa instancia y es la que recibe
    las muestras. Existe para que los tests lo reemplacen con
    `dependency_overrides`.
    """
    return connection.app.state.realtime_service


RealtimeServiceDep = Annotated[RealtimeService, Depends(get_realtime_service)]


@router.get("/status")
async def get_realtime_status(user: CurrentUser, service: RealtimeServiceDep) -> RealtimeStatus:
    """Si el modulo de tiempo real esta disponible ahora (RF04).

    Es una foto: para enterarse de los cambios, el frontend escucha
    reactor.state.
    """
    return service.get_status()


@router.websocket("/ws")
async def realtime_ws(
    websocket: WebSocket, user: CurrentUserWS, service: RealtimeServiceDep
) -> None:
    """Muestras del reactor en vivo, solo de las variables que elige el cliente."""
    await service.serve(websocket)
