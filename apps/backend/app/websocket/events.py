# Catalogo de tipos de evento enviados por WebSocket. El frontend
# (services/websocket/topics.ts) debe mantenerse en sync con estos nombres.
# La forma de cada evento esta en docs/architecture/websocket-protocol.md.
from enum import IntEnum, StrEnum

from pydantic import BaseModel


class WSTopic(StrEnum):
    REALTIME_SAMPLES = "realtime.samples"
    REACTOR_STATE = "reactor.state"


class WSEventType(StrEnum):
    SAMPLE = "sample"
    STATE_CHANGED = "state_changed"
    ERROR = "error"


def build_event(event_type: WSEventType, data: BaseModel) -> dict:
    """Sobre comun de todos los eventos: `{"type": ..., "data": ...}`.

    `type` dice como interpretar `data`, asi el cliente despacha por un solo
    campo sin adivinar por la forma del contenido. Devuelve un dict listo
    para `manager.broadcast()`: `mode="json"` convierte fechas y enums.
    """
    return {"type": event_type.value, "data": data.model_dump(mode="json")}


class WSCloseCode(IntEnum):
    """Codigos con los que el backend cierra una conexion.

    Son parte del contrato: el frontend decide que hacer segun el codigo (ver
    docs/architecture/websocket-protocol.md).
    """

    # RFC 6455 7.4.1. Falta el token, es invalido o es un refresh. No tiene
    # sentido reintentar con el mismo token: hay que volver a iniciar sesion.
    POLICY_VIOLATION = 1008
    # RFC 6455 7.4.1 (registro IANA). El cliente no consumia los mensajes a
    # tiempo y se lo desconecto para no frenar al resto. Puede reconectar.
    TRY_AGAIN_LATER = 1013
    # Rango privado 4000-4999 (RFC 6455 7.4.2). 4401 por analogia con HTTP
    # 401, la misma convencion que usa graphql-ws. El token vencio: renovar con
    # el refresh token y reconectar.
    TOKEN_EXPIRED = 4401
