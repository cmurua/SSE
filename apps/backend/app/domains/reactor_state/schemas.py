from datetime import datetime

from pydantic import BaseModel


class ReactorState(BaseModel):
    sermo: bool
    status: str  # "OPERACION" | "DETENIDO"
    updated_at: datetime
