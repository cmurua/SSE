# SUPUESTO: tabla ancha (una fila = una muestra temporal, una columna por
# variable), tal como fue descripto. Se listan solo columnas de ejemplo:
# completar hasta ~30 variables cuando se confirme el listado real
# (ver variable_catalog.py). Alternativa descartada: modelo EAV, por ser
# mas costoso de consultar a 1 muestra/segundo con hasta 100 usuarios.
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ReactorSample(Base):
    __tablename__ = "reactor_samples"

    id: Mapped[int] = mapped_column(primary_key=True)
    operation_id: Mapped[str] = mapped_column(ForeignKey("operations.id"), index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)

    pot_nuc: Mapped[float | None] = mapped_column(Float)
    rea_neu: Mapped[float | None] = mapped_column(Float)
    pos_br1: Mapped[float | None] = mapped_column(Float)
    # ... completar hasta ~30 columnas cuando se confirme el listado real.
