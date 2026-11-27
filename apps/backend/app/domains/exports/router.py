# POST /exports/log: constancia de una exportacion hecha en el navegador
# (RNF03).
#
# El PNG se genera del lado del frontend (grafico SVG -> canvas -> PNG), asi
# que el backend no ve el archivo: el frontend avisa con este endpoint. El CSV
# lo genera el backend (GET /historicals/operations/{id}/samples.csv) y se
# registra ahi mismo, sin pasar por aca.
from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.domains.audit.dependencies import ClientIp, get_audit_service
from app.domains.audit.service import AuditService
from app.domains.auth.dependencies import CurrentUser
from app.domains.exports.schemas import ExportLogRequest
from app.domains.exports.service import ExportsService

router = APIRouter()


def get_exports_service(
    audit_service: Annotated[AuditService, Depends(get_audit_service)],
) -> ExportsService:
    return ExportsService(audit_service)


ExportsServiceDep = Annotated[ExportsService, Depends(get_exports_service)]


@router.post("/log", status_code=status.HTTP_204_NO_CONTENT)
def log_export(
    body: ExportLogRequest,
    user: CurrentUser,
    ip: ClientIp,
    service: ExportsServiceDep,
) -> None:
    """Registra una imagen exportada desde Tiempo Real o un historico."""
    service.log_image_export(user.username, ip, body)
