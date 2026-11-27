# Dependencies para que un router deje constancia en la auditoria (RNF03).
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.domains.audit.repository import AuditRepository
from app.domains.audit.service import AuditService

# Sin `request.client` (p. ej. un cliente de test sin socket) no hay IP, pero
# la columna no admite NULL: la entrada se guarda igual.
UNKNOWN_IP = "desconocida"


def get_audit_service(db: Annotated[Session, Depends(get_db)]) -> AuditService:
    return AuditService(AuditRepository(db))


def get_client_ip(request: Request) -> str:
    """IP de quien hizo el request.

    Es la del socket: detras de un proxy seria la del proxy. Si se publica
    detras de nginx, arrancar uvicorn con `--proxy-headers` y
    `--forwarded-allow-ips` para que Starlette la tome de X-Forwarded-For.
    """
    return request.client.host if request.client else UNKNOWN_IP


ClientIp = Annotated[str, Depends(get_client_ip)]
