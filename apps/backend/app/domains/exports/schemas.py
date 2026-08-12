from pydantic import BaseModel


class ExportLogRequest(BaseModel):
    operation_id: str | None = None
    variables: list[str]
    format: str = "png"
