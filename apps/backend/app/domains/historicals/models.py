from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Operation(Base):
    """Sesion de operacion del reactor: agrupa las muestras de un ensayo.

    Una operacion ABIERTA es la que todavia no tiene fecha de cierre
    (`ended_at IS NULL`): el reactor esta operando y siguen llegando muestras.
    Cerrarla es escribir `ended_at`; a partir de ahi la operacion es un
    historico inmutable (RF06). No hay columna de duracion: se deriva de
    `ended_at - started_at`, porque guardarla obligaria a inventar un valor
    mientras la operacion esta abierta y a mantener dos datos sincronizados.

    SUPUESTO: es la representacion de la opcion 1 de la tarea 2.1 (derivar
    SERMO de la DB). El ADR todavia no esta escrito; si la decision final es
    una senal dedicada, `ended_at` sigue siendo valido como metadato de la
    operacion, pero deja de ser la fuente de verdad de "el reactor opera".
    """

    __tablename__ = "operations"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    ended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    operator: Mapped[str] = mapped_column(String)
    notes: Mapped[str | None] = mapped_column(String, nullable=True)
