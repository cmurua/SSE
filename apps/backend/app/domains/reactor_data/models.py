# SUPUESTO: tabla ancha (una fila = una muestra temporal, una columna por
# variable), tal como fue descripto. Una columna por cada entrada de
# variable_catalog.py, con el nombre que define `sample_column()`; el catalogo
# es PROVISIONAL, asi que este listado cambia junto con el (tarea 3.9).
# Alternativa descartada: modelo EAV, por ser mas costoso de consultar a 1
# muestra/segundo con hasta 100 usuarios.
#
# Todas las variables se guardan como Float y nullable: una muestra puede
# llegar incompleta si el SIR no publica algun canal, y distinguir "no medido"
# (NULL) de un 0 real importa para los graficos de RF05.
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ReactorSample(Base):
    __tablename__ = "reactor_samples"

    __table_args__ = (
        # Toda consulta de series temporales (RF05 en vivo, RF06 historicos)
        # filtra por operacion y ordena por tiempo. El indice compuesto cubre
        # tambien los filtros por operation_id solo, por ser su prefijo.
        Index("ix_reactor_samples_operation_id_timestamp", "operation_id", "timestamp"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    operation_id: Mapped[str] = mapped_column(String, ForeignKey("operations.id"))
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    # Nucleo
    pot_nuc: Mapped[float | None] = mapped_column(Float)
    flu_neu: Mapped[float | None] = mapped_column(Float)
    tem_nuc: Mapped[float | None] = mapped_column(Float)
    niv_mod: Mapped[float | None] = mapped_column(Float)

    # Refrigeracion
    tem_pil: Mapped[float | None] = mapped_column(Float)
    pre_pri: Mapped[float | None] = mapped_column(Float)
    cau_ref: Mapped[float | None] = mapped_column(Float)
    niv_pil: Mapped[float | None] = mapped_column(Float)

    # Control
    pos_br1: Mapped[float | None] = mapped_column(Float)
    pos_br2: Mapped[float | None] = mapped_column(Float)
    pos_br3: Mapped[float | None] = mapped_column(Float)
    pos_br4: Mapped[float | None] = mapped_column(Float)
    pos_brs: Mapped[float | None] = mapped_column(Float)

    # Cinetica
    per_rea: Mapped[float | None] = mapped_column(Float)
    rea_neu: Mapped[float | None] = mapped_column(Float)

    # Radiacion
    dos_sal: Mapped[float | None] = mapped_column(Float)
    dos_pil: Mapped[float | None] = mapped_column(Float)
    dos_ven: Mapped[float | None] = mapped_column(Float)

    # Sala
    tem_amb: Mapped[float | None] = mapped_column(Float)
    hum_amb: Mapped[float | None] = mapped_column(Float)
    pre_atm: Mapped[float | None] = mapped_column(Float)

    # Instrumentacion
    vol_det1: Mapped[float | None] = mapped_column(Float)
    vol_det2: Mapped[float | None] = mapped_column(Float)
    fre_det: Mapped[float | None] = mapped_column(Float)
    rui_det: Mapped[float | None] = mapped_column(Float)

    # Electrico
    ten_red: Mapped[float | None] = mapped_column(Float)
    cor_bom: Mapped[float | None] = mapped_column(Float)
    est_bom: Mapped[float | None] = mapped_column(Float)

    # Ventilacion
    cau_ven: Mapped[float | None] = mapped_column(Float)
    pre_ven: Mapped[float | None] = mapped_column(Float)

    # Quimica
    con_ph: Mapped[float | None] = mapped_column(Float)
    con_o2: Mapped[float | None] = mapped_column(Float)
    con_con: Mapped[float | None] = mapped_column(Float)
