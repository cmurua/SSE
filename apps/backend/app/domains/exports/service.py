from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from app.domains.audit.service import AuditService
from app.domains.exports.schemas import ExportLogRequest


class ExportsService:
    """Constancia de cada exportacion (RNF03).

    Los archivos no se generan aca: el PNG lo arma el navegador y el CSV el
    dominio de historicos. Este servicio solo deja el registro, con la misma
    forma para los dos formatos.
    """

    def __init__(self, audit_service: AuditService) -> None:
        self._audit_service = audit_service

    def log_image_export(self, user: str, ip: str, request: ExportLogRequest) -> None:
        self._log(user, ip, request.model_dump())

    def log_csv_export(
        self,
        user: str,
        ip: str,
        *,
        operation_id: str,
        variables: Sequence[str],
        start: float,
        end: float,
        file_name: str,
    ) -> None:
        self._log(
            user,
            ip,
            {
                "format": "csv",
                "source": "historicals",
                "operation_id": operation_id,
                "variables": list(variables),
                "start": start,
                "end": end,
                "file_name": file_name,
            },
        )

    def _log(self, user: str, ip: str, detail: dict[str, Any]) -> None:
        self._audit_service.log_export(user, ip, detail)
