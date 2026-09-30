from datetime import datetime

from sqlalchemy import DateTime, Index, String, text
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

    La fila abierta es CONSECUENCIA de la senal SERMO, no su origen: SERMO
    llega por MQTT desde la FPGA y es ReactorStateService el unico que abre y
    cierra estas filas (ver docs/decisions/0004-representacion-sermo.md). Como
    proyeccion de esa senal, "hay una operacion abierta" sigue siendo
    equivalente a "el reactor opera", pero preguntarselo a la base agrega
    latencia sin agregar certeza.

    Como maximo puede haber una abierta a la vez, garantizado por indice unico
    parcial en la base (ver __table_args__).
    """

    __tablename__ = "operations"

    __table_args__ = (
        # Como maximo una operacion abierta. Indice unico parcial sobre la
        # expresion, no sobre la columna: dos NULL no chocan entre si en un
        # indice unico de Postgres. Ver la migracion
        # `a1c3f7d2e910_una_sola_operacion_abierta`.
        Index(
            "uq_operations_una_abierta",
            text("(ended_at IS NULL)"),
            unique=True,
            postgresql_where=text("ended_at IS NULL"),
        ),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    ended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    operator: Mapped[str] = mapped_column(String)
    notes: Mapped[str | None] = mapped_column(String, nullable=True)
