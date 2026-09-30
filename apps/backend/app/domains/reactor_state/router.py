# GET /reactor-state (REST) + WS /reactor-state/ws (topico reactor.state).
# Fuente de verdad unica de SERMO/estado de operacion, consumida por
# domains.realtime para habilitar/deshabilitar el tiempo real (RF04).
#
# El servicio ya esta construido y vivo: lo arma el lifespan de la app y lo
# deja en `request.app.state.reactor_state_service` (ver app/composition.py).
# NO construir otro aca: el estado de SERMO vive en memoria de esa instancia,
# y una segunda copia responderia siempre "detenido".
#     service = request.app.state.reactor_state_service
#     return service.get_current_state()
# Implementar el endpoint es la tarea 2.2; el WebSocket, la 2.5 (que engancha
# con service.register_listener()).
from fastapi import APIRouter, WebSocket

router = APIRouter()


@router.get("")
def get_reactor_state():
    raise NotImplementedError


@router.websocket("/ws")
async def reactor_state_ws(websocket: WebSocket):
    raise NotImplementedError
