# Autenticacion de conexiones WebSocket: valida el access token (mismo JWT
# que REST) antes de aceptar la conexion. TODO: implementar una vez que
# app.core.security este completo.
from fastapi import WebSocket


async def get_current_user_ws(websocket: WebSocket):
    raise NotImplementedError("Pendiente: validar JWT en el handshake del WebSocket")
