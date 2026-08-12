from pydantic import BaseModel


class ReportCreateRequest(BaseModel):
    report_type: str
    subject: str
    message: str
