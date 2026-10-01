# SUPUESTO: tabla ancha (una fila = una muestra temporal, una columna por
# señal), tal como fue descripto. Una columna por cada entrada de
# variable_catalog.py, con el nombre que define `sample_column()`.
# Alternativa descartada: modelo EAV, por ser mas costoso de consultar a 1
# muestra/segundo con hasta 100 usuarios.
#
# Las 34 columnas corresponden al listado real de señales del RA-0 (tarea
# 3.9). Agregar o quitar una señal implica una migracion Alembic, asi que el
# listado no deberia moverse salvo que cambie la instrumentacion; los rangos
# del catalogo, en cambio, se corrigen sin tocar el esquema.
#
# Todas las señales se guardan como Float y nullable: una muestra puede llegar
# incompleta si el SIR no publica algun canal, y distinguir "no medido" (NULL)
# de un 0 real importa para los graficos de RF05.
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


    # SA1 - Canal de Arranque 1
    loga1: Mapped[float | None] = mapped_column(Float)
    ta1: Mapped[float | None] = mapped_column(Float)

    # SA2 - Canal de Arranque 2
    loga2: Mapped[float | None] = mapped_column(Float)
    ta2: Mapped[float | None] = mapped_column(Float)

    # SM1 - Canal de Marcha 1
    logm1: Mapped[float | None] = mapped_column(Float)
    tm1: Mapped[float | None] = mapped_column(Float)

    # SM2 - Canal de Marcha 2
    logm2: Mapped[float | None] = mapped_column(Float)
    tm2: Mapped[float | None] = mapped_column(Float)

    # SMP - Canal Lineal de Marcha
    lcm4: Mapped[float | None] = mapped_column(Float)
    linm4: Mapped[float | None] = mapped_column(Float)

    # SP2 - Proteccion
    ndcm4: Mapped[float | None] = mapped_column(Float)

    # SMA - Monitores de Area
    masc: Mapped[float | None] = mapped_column(Float)
    mabt: Mapped[float | None] = mapped_column(Float)
    marr: Mapped[float | None] = mapped_column(Float)
    matm: Mapped[float | None] = mapped_column(Float)
    maae: Mapped[float | None] = mapped_column(Float)
    ndsc: Mapped[float | None] = mapped_column(Float)
    ndbt: Mapped[float | None] = mapped_column(Float)
    ndrr: Mapped[float | None] = mapped_column(Float)
    ndtm: Mapped[float | None] = mapped_column(Float)
    ndae: Mapped[float | None] = mapped_column(Float)

    # SCM - Circuito de Moderador
    tt1: Mapped[float | None] = mapped_column(Float)
    tn1: Mapped[float | None] = mapped_column(Float)
    nt1: Mapped[float | None] = mapped_column(Float)
    nn1: Mapped[float | None] = mapped_column(Float)
    qin: Mapped[float | None] = mapped_column(Float)
    qtm: Mapped[float | None] = mapped_column(Float)
    qrd: Mapped[float | None] = mapped_column(Float)

    # SBC - Barras de Control
    posbc1: Mapped[float | None] = mapped_column(Float)
    posbc2: Mapped[float | None] = mapped_column(Float)
    posbc3: Mapped[float | None] = mapped_column(Float)
    posbc4: Mapped[float | None] = mapped_column(Float)

    # SSO - Supervision de Operacion
    reactm4: Mapped[float | None] = mapped_column(Float)
    potm4: Mapped[float | None] = mapped_column(Float)
