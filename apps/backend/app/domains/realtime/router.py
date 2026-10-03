# GET /realtime/status (REST) + WS /realtime/ws (topico realtime.samples).
# Habilitado solo cuando reactor_state.sermo == True (RF04). Latencia
# maxima objetivo: RNF01 (<= 2s).
from fastapi import APIRouter, WebSocket

from app.websocket.dependencies import CurrentUserWS

router = APIRouter()


@router.get("/status")
def get_realtime_status():
    raise NotImplementedError


# Protegido desde ya, aunque el cuerpo este pendiente: sin token cierra con
# 1008 en vez de llegar al NotImplementedError.
@router.websocket("/ws")
async def realtime_ws(websocket: WebSocket, user: CurrentUserWS):
    raise NotImplementedError
