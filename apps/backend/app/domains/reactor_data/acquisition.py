# Proceso de toma de datos: mientras el reactor opera, lee muestras de la
# fuente configurada y las guarda en `reactor_samples`.
#
# Lo arranca y lo detiene ReactorStateService cuando llega la senal SERMO por
# MQTT; este modulo no sabe nada de MQTT ni de SERMO, solo de "grabar muestras
# de la operacion X hasta que me digan basta".
from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime

from app.domains.reactor_data.repository import ReactorSampleRepository
from app.domains.reactor_data.sources.base import SampleSource

logger = logging.getLogger(__name__)


class AcquisitionService:
    def __init__(
        self,
        *,
        source: SampleSource,
        repository: ReactorSampleRepository,
        interval_seconds: float = 1.0,
    ) -> None:
        self._source = source
        self._repository = repository
        self._interval = interval_seconds
        self._task: asyncio.Task | None = None
        self._operation_id: str | None = None
        self._samples = 0

    @property
    def running(self) -> bool:
        return self._task is not None and not self._task.done()

    @property
    def operation_id(self) -> str | None:
        return self._operation_id

    @property
    def samples_written(self) -> int:
        return self._samples

    async def start(self, operation_id: str, started_at: datetime) -> None:
        if self.running:
            # No es un error: un mensaje SERMO duplicado llega hasta aca si
            # alguien llama start() sin pasar por el servicio de estado.
            logger.warning(
                "Toma de datos ya activa para %s; se ignora el arranque de %s.",
                self._operation_id,
                operation_id,
            )
            return

        await self._source.open(operation_id, started_at)
        self._operation_id = operation_id
        self._samples = 0
        self._task = asyncio.create_task(
            self._run(operation_id), name=f"acquisition-{operation_id}"
        )
        logger.info(
            "Toma de datos iniciada para %s (1 muestra cada %.3gs).",
            operation_id,
            self._interval,
        )

    async def stop(self) -> None:
        task, self._task = self._task, None
        if task is not None and not task.done():
            task.cancel()
            # Se espera la cancelacion antes de devolver el control: quien
            # llama (ReactorStateService) cierra la operacion inmediatamente
            # despues, y una muestra escrita tras el `ended_at` quedaria
            # fuera del intervalo de su propia operacion.
            try:
                await task
            except asyncio.CancelledError:
                pass

        await self._source.close()
        if self._operation_id is not None:
            logger.info(
                "Toma de datos detenida para %s: %d muestras.",
                self._operation_id,
                self._samples,
            )
        self._operation_id = None

    async def _run(self, operation_id: str) -> None:
        # Cadencia por reloj absoluto y no `sleep(interval)` a secas, para que
        # el costo del INSERT no haga derivar la frecuencia de muestreo.
        started = asyncio.get_running_loop().time()
        written = 0
        try:
            while True:
                elapsed = written * self._interval
                values = await self._source.read(elapsed)
                # El INSERT es sincronico (SQLAlchemy sync, como el resto del
                # backend): se manda a un thread para no bloquear el event
                # loop, que es el que atiende los WebSockets de tiempo real.
                await asyncio.to_thread(
                    self._repository.insert, operation_id, datetime.now(UTC), values
                )
                written += 1
                self._samples = written

                next_tick = started + written * self._interval
                await asyncio.sleep(max(0.0, next_tick - asyncio.get_running_loop().time()))
        except asyncio.CancelledError:
            raise
        except Exception:
            # Que se caiga la toma de datos no puede tumbar el backend: los
            # historicos y el login tienen que seguir funcionando. Queda
            # registrado y la operacion se cierra cuando llegue el SERMO OFF.
            logger.exception(
                "La toma de datos de %s se detuvo por un error tras %d muestras.",
                operation_id,
                written,
            )
