from datetime import datetime

from pydantic import BaseModel, computed_field


class OperationSummary(BaseModel):
    id: str
    name: str
    started_at: datetime
    # None mientras la operacion sigue abierta (ver Operation en models.py).
    ended_at: datetime | None
    operator: str

    @computed_field
    @property
    def duration_minutes(self) -> int | None:
        """Duracion de la operacion, o None si todavia no cerro."""
        if self.ended_at is None:
            return None
        return int((self.ended_at - self.started_at).total_seconds() // 60)
