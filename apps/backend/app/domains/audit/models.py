from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    user: Mapped[str | None] = mapped_column(String, nullable=True)
    ip_address: Mapped[str] = mapped_column(String)
    action: Mapped[str] = mapped_column(String)
    result: Mapped[str] = mapped_column(String)  # "success" | "failure"
    detail: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
