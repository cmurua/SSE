from pydantic import BaseModel


class RealtimeStatus(BaseModel):
    enabled: bool
    reason: str | None = None
