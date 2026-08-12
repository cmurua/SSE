# GET /realtime/status (REST) + WS /realtime/ws (topico realtime.samples).
# Habilitado solo cuando reactor_state.sermo == True (RF04). Latencia
# maxima objetivo: RNF01 (<= 2s).
from fastapi import APIRouter, WebSocket

router = APIRouter()


@router.get("/status")
def get_realtime_status():
    raise NotImplementedError


@router.websocket("/ws")
async def realtime_ws(websocket: WebSocket):
    raise NotImplementedError
