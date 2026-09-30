# Escritura de `reactor_samples`. Es el lado de ESCRITURA del dominio: la
# lectura de series para RF05/RF06 vive en historicals/repository.py.
#
# Como OperationLifecycleRepository, recibe una session_factory y no una
# sesion: lo usa el bucle de toma de datos, que corre durante toda la
# operacion y no puede sostener una sola sesion abierta por horas.
from __future__ import annotations

from collections.abc import Callable
from datetime import datetime

from sqlalchemy.orm import Session

from app.domains.reactor_data.models import ReactorSample
from app.domains.reactor_data.sources.base import SampleValues

SessionFactory = Callable[[], Session]


class ReactorSampleRepository:
    def __init__(self, session_factory: SessionFactory) -> None:
        self._session_factory = session_factory

    def insert(self, operation_id: str, timestamp: datetime, values: SampleValues) -> None:
        with self._session_factory() as session:
            session.add(
                ReactorSample(operation_id=operation_id, timestamp=timestamp, **values)
            )
            session.commit()
