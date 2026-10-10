# GET /reactor-state (REST) + WS /reactor-state/ws (topico reactor.state).
# Fuente de verdad unica de SERMO/estado de operacion, consumida por
# domains.realtime para habilitar/deshabilitar el tiempo real (RF04).
#
# El WebSocket recibe el estado actual al conectarse y despues un
# `state_changed` por cada cambio, que publica `publish_state_changed()`
# registrado como listener del servicio en el lifespan (app/main.py). El
# contrato completo -- autenticacion y forma de los eventos -- esta en
# docs/architecture/websocket-protocol.md.
from typing import Annotated

from fastapi import APIRouter, Depends, WebSocket
from fastapi.requests import HTTPConnection

from app.domains.auth.dependencies import CurrentUser
from app.domains.reactor_state.schemas import ReactorState
from app.domains.reactor_state.service import ReactorStateService
from app.websocket.dependencies import CurrentUserWS
from app.websocket.events import WSEventType, WSTopic, build_event
from app.websocket.manager import manager

router = APIRouter()


def get_reactor_state_service(connection: HTTPConnection) -> ReactorStateService:
    """El servicio que armo el lifespan de la app (ver app/composition.py).

    NO construir otro: el estado de SERMO vive en memoria de esa instancia, y
    una segunda copia responderia siempre "detenido". Esta dependency existe
    para que los tests puedan reemplazarlo con `dependency_overrides`, porque
    sin el lifespan `app.state` no lo tiene.

    Recibe `HTTPConnection` y no `Request` porque la usan tanto el GET como
    el WebSocket, y FastAPI solo inyecta `Request` en endpoints HTTP.
    """
    return connection.app.state.reactor_state_service


ReactorStateServiceDep = Annotated[ReactorStateService, Depends(get_reactor_state_service)]


# La proteccion va por endpoint y no en el include_router: este router tiene
# tambien el WebSocket, y HTTPBearer no sirve en un handshake WS. El WS se
# protege con `user: CurrentUserWS` (app/websocket/dependencies.py).
@router.get("")
async def get_reactor_state(
    user: CurrentUser, service: ReactorStateServiceDep
) -> ReactorState:
    """Estado actual del reactor, para la carga inicial del frontend.

    `async` a proposito: el estado lo escribe el event loop al recibir SERMO,
    y leerlo desde el mismo loop evita pasar por el threadpool de FastAPI.
    Los cambios posteriores llegan por el WebSocket /reactor-state/ws.
    """
    return service.get_current_state()


def state_changed_event(state: ReactorState) -> dict:
    return build_event(WSEventType.STATE_CHANGED, state)


async def publish_state_changed(state: ReactorState) -> None:
    """Listener del servicio: avisa el cambio a todos los suscriptos.

    Se registra una sola vez, en el lifespan, y no por conexion: el servicio
    avisa una vez y el manager reparte. Asi el costo de un cambio para el
    servicio no crece con la cantidad de clientes, y un cliente que se va no
    deja un listener colgado.
    """
    await manager.broadcast(WSTopic.REACTOR_STATE, state_changed_event(state))


@router.websocket("/ws")
async def reactor_state_ws(
    websocket: WebSocket, user: CurrentUserWS, service: ReactorStateServiceDep
) -> None:
    """Cambios de estado del reactor, sin que el cliente tenga que consultar.

    Lo primero que recibe el cliente es el estado actual, con el mismo
    evento que un cambio: no tiene que esperar a que el reactor arranque o se
    detenga para saber en que estado esta, ni combinar con GET /reactor-state.
    """
    await manager.serve(
        WSTopic.REACTOR_STATE,
        websocket,
        initial_message=lambda: state_changed_event(service.get_current_state()),
    )
