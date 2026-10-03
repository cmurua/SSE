# GET /reactor-state (REST) + WS /reactor-state/ws (topico reactor.state).
# Fuente de verdad unica de SERMO/estado de operacion, consumida por
# domains.realtime para habilitar/deshabilitar el tiempo real (RF04).
#
# El WebSocket es la tarea 2.5 (engancha con service.register_listener()).
# Se protege con CurrentUserWS y se atiende con manager.serve(); el contrato
# de autenticacion esta en docs/architecture/websocket-protocol.md.
from typing import Annotated

from fastapi import APIRouter, Depends, Request, WebSocket

from app.domains.auth.dependencies import CurrentUser
from app.domains.reactor_state.schemas import ReactorState
from app.domains.reactor_state.service import ReactorStateService
from app.websocket.dependencies import CurrentUserWS

router = APIRouter()


def get_reactor_state_service(request: Request) -> ReactorStateService:
    """El servicio que armo el lifespan de la app (ver app/composition.py).

    NO construir otro: el estado de SERMO vive en memoria de esa instancia, y
    una segunda copia responderia siempre "detenido". Esta dependency existe
    para que los tests puedan reemplazarlo con `dependency_overrides`, porque
    sin el lifespan `app.state` no lo tiene.
    """
    return request.app.state.reactor_state_service


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
    Los cambios posteriores llegan por el WebSocket (tarea 2.5).
    """
    return service.get_current_state()


# Protegido desde ya, aunque el cuerpo sea de la 2.5: sin token cierra con
# 1008 en vez de llegar al NotImplementedError.
@router.websocket("/ws")
async def reactor_state_ws(websocket: WebSocket, user: CurrentUserWS):
    raise NotImplementedError
