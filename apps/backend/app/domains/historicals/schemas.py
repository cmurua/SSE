from datetime import datetime

from pydantic import BaseModel


class OperationSummary(BaseModel):
    id: str
    name: str
    date: datetime
    duration_minutes: int
    operator: str
