# Catalogo de tipos de evento enviados por WebSocket. El frontend
# (services/websocket/topics.ts) debe mantenerse en sync con estos nombres.
from enum import StrEnum


class WSTopic(StrEnum):
    REALTIME_SAMPLES = "realtime.samples"
    REACTOR_STATE = "reactor.state"


class WSEventType(StrEnum):
    SAMPLE = "sample"
    STATE_CHANGED = "state_changed"
    ERROR = "error"
