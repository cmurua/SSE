from pydantic import BaseModel


class ReactorVariable(BaseModel):
    id: str
    name: str
    unit: str
    group: str


class ReactorSample(BaseModel):
    operation_id: str
    timestamp: str
    values: dict[str, float]
