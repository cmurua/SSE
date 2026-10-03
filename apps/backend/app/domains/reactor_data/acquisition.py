# Proceso de toma de datos: mientras el reactor opera, lee muestras de la
# fuente configurada y las guarda en `reactor_samples`.
#
# Lo arranca y lo detiene ReactorStateService cuando llega la senal SERMO por
# MQTT; este modulo no sabe nada de MQTT ni de SERMO, solo de "grabar muestras
# de la operacion X hasta que me digan basta".
#
# Es tambien el origen del tiempo real: cada muestra que se guarda se avisa a
# los listeners registrados, en el mismo proceso, sin volver a leerla de la
# base (ver docs/decisions/0006-mecanismo-lectura-tiempo-real.md).
from __future__ import annotations

import asyncio
import logging
from collections import deque
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy.exc import SQLAlchemyError

from app.domains.reactor_data.repository import ReactorSampleRepository
from app.domains.reactor_data.sources.base import SampleSource, SampleValues

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AcquiredSample:
    """Una muestra de la operacion en curso, tal como se guardo en la base."""

    operation_id: str
    timestamp: datetime
    values: SampleValues


SampleListener = Callable[[AcquiredSample], Awaitable[None]]


class AcquisitionService:
    def __init__(
        self,
        *,
        source: SampleSource,
        repository: ReactorSampleRepository,
        interval_seconds: float = 1.0,
        retry_max_seconds: float = 10.0,
        max_pending_samples: int = 3600,
    ) -> None:
        self._source = source
        self._repository = repository
        self._interval = interval_seconds
        self._retry_max = retry_max_seconds
        # Dos tareas y no una: leer la fuente y escribir en la base van por
        # separado para que una base colgada (un INSERT que no falla pero
        # tampoco vuelve) no frene el muestreo. Verificado deteniendo el
        # contenedor de Postgres: con una sola tarea el bucle quedaba parado
        # en el INSERT y la cadencia de 1 Hz se perdia.
        self._task: asyncio.Task | None = None
        self._writer: asyncio.Task | None = None
        self._wake_writer = asyncio.Event()
        self._operation_id: str | None = None
        self._samples = 0
        self._listeners: list[SampleListener] = []
        # Muestras leidas que todavia no se pudieron guardar porque la base no
        # responde. Acotado: con la base caida una hora larga se pierden las
        # mas viejas antes que quedarse sin memoria (3600 = 1 h a 1 Hz).
        self._pending: deque[AcquiredSample] = deque(maxlen=max_pending_samples)
        self._storage_down = False
        self._dropped = 0

    @property
    def running(self) -> bool:
        return self._task is not None and not self._task.done()

    @property
    def operation_id(self) -> str | None:
        return self._operation_id

    @property
    def samples_written(self) -> int:
        return self._samples

    @property
    def pending_samples(self) -> int:
        """Muestras leidas que esperan a que vuelva la base."""
        return len(self._pending)

    def register_listener(self, listener: SampleListener) -> None:
        """Registra un observador de muestras nuevas.

        Es el enganche del WebSocket `realtime.samples` (issue 3.2). Solo se
        avisan muestras ya guardadas: lo que se ve en vivo es exactamente lo
        que despues muestran los historicos de esa operacion.

        El listener se espera en la tarea que escribe, no en la que lee: uno
        lento demora la entrega de las muestras siguientes, pero no la
        cadencia de muestreo. Igual tiene que ser rapido;
        `websocket.manager.broadcast` lo es, porque envia en paralelo y acota
        el tiempo de cada cliente.
        """
        self._listeners.append(listener)

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
            self._read_loop(operation_id), name=f"acquisition-{operation_id}"
        )
        self._writer = asyncio.create_task(
            self._write_loop(), name=f"acquisition-writer-{operation_id}"
        )
        logger.info(
            "Toma de datos iniciada para %s (1 muestra cada %.3gs).",
            operation_id,
            self._interval,
        )

    async def stop(self) -> None:
        tasks = (self._task, self._writer)
        self._task = self._writer = None
        for task in tasks:
            if task is None or task.done():
                continue
            task.cancel()
            # Se espera la cancelacion antes de devolver el control: quien
            # llama (ReactorStateService) cierra la operacion inmediatamente
            # despues, y una muestra escrita tras el `ended_at` quedaria
            # fuera del intervalo de su propia operacion.
            try:
                await task
            except asyncio.CancelledError:
                pass

        # Ultima oportunidad para lo que quedo en memoria por un corte de la
        # base: despues de esto se cierra la operacion y ya no tiene a donde
        # ir. Sus timestamps son anteriores al `ended_at`, asi que guardarlas
        # ahora no rompe el intervalo de la operacion.
        if self._pending and not await self._flush():
            logger.error(
                "Se perdieron %d muestras de %s: la base no respondio al detener "
                "la toma de datos.",
                len(self._pending),
                self._operation_id,
            )
        self._pending.clear()
        self._wake_writer.clear()
        self._storage_down = False
        self._dropped = 0

        await self._source.close()
        if self._operation_id is not None:
            logger.info(
                "Toma de datos detenida para %s: %d muestras.",
                self._operation_id,
                self._samples,
            )
        self._operation_id = None

    async def _read_loop(self, operation_id: str) -> None:
        loop = asyncio.get_running_loop()
        # Cadencia por reloj absoluto y no `sleep(interval)` a secas, para que
        # el costo de leer la fuente no haga derivar la frecuencia de muestreo.
        started = loop.time()
        tick = 0
        read = 0
        try:
            while True:
                values = await self._source.read(tick * self._interval)
                read += 1
                self._enqueue(AcquiredSample(operation_id, datetime.now(UTC), values))
                self._wake_writer.set()

                tick += 1
                behind = loop.time() - (started + tick * self._interval)
                if behind > self._interval:
                    # Si el bucle se atraso (event loop saturado, fuente lenta)
                    # se saltean los ticks perdidos. Recuperarlos de golpe
                    # leeria varias veces el mismo instante y guardaria una
                    # rafaga de muestras con el mismo timestamp.
                    skipped = int(behind // self._interval)
                    tick += skipped
                    logger.warning(
                        "Toma de datos de %s atrasada: se saltean %d muestras.",
                        operation_id,
                        skipped,
                    )
                next_tick = started + tick * self._interval
                await asyncio.sleep(max(0.0, next_tick - loop.time()))
        except asyncio.CancelledError:
            raise
        except Exception:
            # Que se caiga la toma de datos no puede tumbar el backend: los
            # historicos y el login tienen que seguir funcionando. Queda
            # registrado y la operacion se cierra cuando llegue el SERMO OFF.
            # Un corte de la base NO llega aca: lo maneja _write_loop().
            logger.exception(
                "La toma de datos de %s se detuvo por un error tras %d muestras.",
                operation_id,
                read,
            )

    async def _write_loop(self) -> None:
        """Guarda lo que va leyendo _read_loop() y reintenta si la base falla.

        Con la base caida la fuente se sigue leyendo a 1 Hz (el reactor no
        espera), pero los reintentos se espacian con backoff: no tiene sentido
        golpear una base que no responde una vez por segundo.
        """
        delay = self._interval
        while True:
            await self._wake_writer.wait()
            self._wake_writer.clear()
            if await self._flush():
                delay = self._interval
                continue
            self._wake_writer.set()  # quedaron pendientes
            await asyncio.sleep(delay)
            delay = min(delay * 2, self._retry_max)

    def _enqueue(self, sample: AcquiredSample) -> None:
        if len(self._pending) == self._pending.maxlen:
            self._count_dropped(1)
        self._pending.append(sample)

    def _restore(self, batch: list[AcquiredSample]) -> None:
        """Devuelve al buffer un lote que no se pudo guardar, delante de todo.

        Mientras el INSERT esperaba, _read_loop() siguio agregando muestras
        detras. Si entre las dos cosas se pasa del tope, se descartan las mas
        viejas (las del lote), igual que en _enqueue(): `extendleft` sobre un
        deque lleno descartaria las mas nuevas.
        """
        maxlen = self._pending.maxlen
        overflow = len(batch) + len(self._pending) - maxlen
        if overflow > 0:
            self._count_dropped(overflow)
        self._pending = deque([*batch, *self._pending], maxlen=maxlen)

    def _count_dropped(self, count: int) -> None:
        if self._dropped == 0:
            logger.error(
                "La base sigue sin responder y se lleno el buffer de %d muestras: "
                "se empiezan a descartar las mas viejas.",
                self._pending.maxlen,
            )
        self._dropped += count

    async def _flush(self) -> bool:
        """Guarda las muestras pendientes, en orden. True si no quedo ninguna.

        Las saca del buffer ANTES de escribir: si cancelan la tarea durante el
        INSERT, el thread termina igual y la transaccion se confirma; dejarlas
        en el buffer haria que el stop() las vuelva a insertar duplicadas.
        """
        if not self._pending:
            return True

        batch = list(self._pending)
        self._pending.clear()
        try:
            # El INSERT es sincronico (SQLAlchemy sync, como el resto del
            # backend): se manda a un thread para no bloquear el event loop,
            # que es el que atiende los WebSockets de tiempo real.
            await asyncio.to_thread(
                self._repository.insert_many,
                batch[0].operation_id,
                [(sample.timestamp, sample.values) for sample in batch],
            )
        except SQLAlchemyError as error:
            # La base se cayo o se esta reiniciando. No se corta la toma de
            # datos: las muestras vuelven al buffer y se reintenta mas tarde.
            # El pool (pool_pre_ping) descarta las conexiones muertas, asi que
            # cuando la base vuelve el proximo intento se reconecta solo.
            self._restore(batch)
            if not self._storage_down:
                self._storage_down = True
                logger.warning(
                    "No se pudieron guardar muestras de %s (%s). Se conservan en "
                    "memoria y se reintenta.",
                    batch[0].operation_id,
                    type(error).__name__,
                )
            return False

        self._samples += len(batch)
        if self._storage_down:
            logger.info(
                "Base recuperada: %d muestras guardadas con retraso, %d descartadas.",
                len(batch),
                self._dropped,
            )
            self._storage_down = False
            self._dropped = 0

        for sample in batch:
            await self._notify(sample)
        return True

    async def _notify(self, sample: AcquiredSample) -> None:
        for listener in self._listeners:
            try:
                await listener(sample)
            except Exception:
                # Un observador roto no puede cortar la escritura: la muestra
                # ya esta guardada y los historicos la tienen igual.
                logger.exception("Listener de muestras fallo.")
