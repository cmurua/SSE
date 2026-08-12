# GET /reactor-state (REST) + WS /reactor-state/ws (topico reactor.state).
# Fuente de verdad unica de SERMO/estado de operacion, consumida por
# domains.realtime para habilitar/deshabilitar el tiempo real (RF04).
from fastapi import APIRouter, WebSocket

router = APIRouter()


@router.get("")
def get_reactor_state():
    raise NotImplementedError


@router.websocket("/ws")
async def reactor_state_ws(websocket: WebSocket):
    raise NotImplementedError
