# Servicio transversal usado por el resto de los dominios para dejar
# trazabilidad (RNF03): accesos, errores, exportaciones, consultas y
# conexiones WebSocket. No expone router propio (no es un modulo con UI).
#
# Hoy solo esta implementado el registro de exportaciones (tarea 5.8); el
# resto espera a la tarea que lo use.
from __future__ import annotations

import json
from typing import Any

from app.domains.audit.repository import AuditRepository

ACTION_EXPORT = "export"
RESULT_SUCCESS = "success"
RESULT_FAILURE = "failure"


class AuditService:
    def __init__(self, audit_repository: AuditRepository) -> None:
        self._audit_repository = audit_repository

    def log_access(self, user: str, ip: str, successful: bool) -> None:
        raise NotImplementedError

    def log_error(self, user: str | None, ip: str, detail: str) -> None:
        raise NotImplementedError

    def log_export(self, user: str, ip: str, detail: dict[str, Any]) -> None:
        """Deja constancia de una exportacion (PNG o CSV).

        `detail` se guarda como JSON (formato, operacion, variables, ventana,
        archivo) para poder filtrarlo despues sin parsear texto libre.
        """
        self._audit_repository.add(
            user=user,
            ip_address=ip,
            action=ACTION_EXPORT,
            result=RESULT_SUCCESS,
            detail=json.dumps(detail, ensure_ascii=False, sort_keys=True),
        )

    def log_query(self, user: str, ip: str, detail: str) -> None:
        raise NotImplementedError

    def log_ws_connection(self, user: str, ip: str, topic: str, connected: bool) -> None:
        raise NotImplementedError
