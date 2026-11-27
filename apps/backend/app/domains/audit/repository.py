from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.domains.audit.models import AuditLog


class AuditRepository:
    def __init__(self, db: Session) -> None:
        self._db = db

    def add(
        self,
        *,
        user: str | None,
        ip_address: str,
        action: str,
        result: str,
        detail: str | None,
    ) -> AuditLog:
        """Guarda una entrada y la confirma en el momento.

        Se hace commit aca y no al final del request: la constancia tiene que
        quedar aunque lo que viene despues (p. ej. el envio de un CSV) falle.
        """
        entry = AuditLog(
            user=user,
            ip_address=ip_address,
            action=action,
            result=result,
            detail=detail,
            created_at=datetime.now(UTC),
        )
        self._db.add(entry)
        self._db.commit()
        return entry
