# Fuente unica de verdad del estado de operacion del reactor (RF04).
#
# El dato NO se deriva de la base: llega como senal externa desde la FPGA por
# MQTT (ver docs/decisions/0004-representacion-sermo.md). La fila abierta en
# `operations` es la CONSECUENCIA de esa senal, no su origen; este servicio es
# el unico que la abre y la cierra.
#
# Es tambien el unico lugar donde se decide "el reactor esta operando": el
# gating del modulo de tiempo real (domains/realtime) consulta aca en vez de
# reimplementar la regla, para no duplicarla como advierte
# docs/architecture/overview.md.
#
# Como se detectan las transiciones (push por MQTT, no polling ni LISTEN/NOTIFY
# sobre Postgres) esta decidido en docs/decisions/0006-mecanismo-lectura-tiempo-real.md.
from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy.exc import SQLAlchemyError

from app.domains.reactor_state.repository import OperationLifecycleRepository
from app.domains.reactor_state.schemas import ReactorState
from app.mqtt.schemas import SermoSignal

logger = logging.getLogger(__name__)

StateListener = Callable[[ReactorState], Awaitable[None]]


class AcquisitionController:
    """Lo que este servicio necesita de la toma de datos.

    Declarado aca y no importado de reactor_data para que la dependencia vaya
    en un solo sentido: reactor_state decide, reactor_data ejecuta.
    """

    async def start(self, operation_id: str, started_at: datetime) -> None: ...

    async def stop(self) -> None: ...


@dataclass(frozen=True)
class _Transition:
    """Un valor de SERMO recibido, con todo lo necesario para aplicarlo despues."""

    sermo: bool
    occurred_at: datetime
    metadata: object | None
    # Si el mensaje traia su propio timestamp. Solo en ese caso tiene sentido
    # medir cuanto tardo en detectarse (RNF01).
    timestamped: bool


class ReactorStateService:
    def __init__(
        self,
        *,
        repository: OperationLifecycleRepository,
        acquisition: AcquisitionController,
        default_operator: str = "Desconocido",
        default_notes: str | None = None,
        retry_min_seconds: float = 1.0,
        retry_max_seconds: float = 10.0,
    ) -> None:
        self._repository = repository
        self._acquisition = acquisition
        self._default_operator = default_operator
        self._default_notes = default_notes
        self._retry_min = retry_min_seconds
        self._retry_max = retry_max_seconds

        self._sermo = False
        self._operation_id: str | None = None
        self._operation_started_at: datetime | None = None
        self._updated_at = datetime.now(UTC)
        self._source_connected = False
        self._listeners: list[StateListener] = []
        # Las transiciones abren/cierran operaciones y arrancan/paran tareas.
        # Dos mensajes juntos (una FPGA que rebota, un retenido que llega
        # pegado a uno nuevo) no pueden ejecutarse entrelazados.
        self._lock = asyncio.Lock()
        # Transicion recibida que no se pudo aplicar porque la base no
        # respondia, y la tarea que la reintenta. Ambas se tocan solo con el
        # lock tomado.
        self._pending: _Transition | None = None
        self._retry_task: asyncio.Task | None = None

    # -- Lectura ----------------------------------------------------------
    def get_current_state(self) -> ReactorState:
        """Estado actual. Se sirve de memoria, no de la base.

        La senal vive en este proceso desde que llega por MQTT: ir a la base a
        responder un GET agregaria latencia y una consulta por request sin
        aportar nada, porque quien escribe esa fila es este mismo servicio.
        """
        return ReactorState.build(
            sermo=self._sermo,
            updated_at=self._updated_at,
            operation_id=self._operation_id,
            source_connected=self._source_connected,
        )

    # -- Escritura --------------------------------------------------------
    def register_listener(self, listener: StateListener) -> None:
        """Registra un observador de cambios de estado.

        Es el enganche para el WebSocket `reactor.state` (issue 2.5): ese
        issue agrega un listener que hace broadcast de `state_changed`, sin
        tocar este servicio.
        """
        self._listeners.append(listener)

    async def apply_signal(self, signal: SermoSignal) -> bool:
        """Procesa un mensaje del topico SERMO. True si hubo transicion."""
        return await self.on_sermo_changed(
            signal.sermo,
            occurred_at=signal.timestamp,
            metadata=signal.operation,
        )

    async def on_sermo_changed(
        self,
        sermo: bool,
        *,
        occurred_at: datetime | None = None,
        metadata: object | None = None,
    ) -> bool:
        """Aplica un valor de SERMO. Idempotente: solo actua en el cambio.

        La idempotencia no es un lujo: con QoS 1 el broker puede reentregar el
        mismo mensaje, y el mensaje retenido se recibe de nuevo en cada
        reconexion. Abrir una operacion por cada mensaje partiria el historico
        en pedazos.

        Si la base no responde, la transicion queda pendiente y se reintenta
        en segundo plano (ver `_retry_pending`); se devuelve False porque el
        estado todavia no cambio. Los listeners se avisan recien cuando se
        aplica. Una senal nueva siempre reemplaza a la pendiente: lo que vale
        es el ultimo valor que publico la FPGA, no el primero.
        """
        transition = _Transition(
            sermo=sermo,
            # Se fija al recibir y no al aplicar: si la base tarda en volver,
            # la operacion igual tiene que empezar cuando empezo de verdad.
            occurred_at=_as_utc(occurred_at) or datetime.now(UTC),
            metadata=metadata,
            timestamped=occurred_at is not None,
        )
        async with self._lock:
            superseded, self._pending = self._pending, None
            if self._interrupted_end(superseded, transition):
                # El reactor se detuvo y volvio a arrancar mientras la base
                # estaba caida: el cierre nunca llego a la base, asi que la
                # operacion sigue abierta. Se la retoma en vez de abrir otra
                # (no se puede abrir ninguna sin base).
                await self._resume_acquisition()
                return False
            changed = await self._apply_or_defer(transition)

        if changed:
            await self._notify()
        return changed

    async def shutdown(self) -> None:
        """Cancela el reintento pendiente, si lo hay. Lo llama el lifespan."""
        task, self._retry_task = self._retry_task, None
        if task is not None and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    async def set_source_connected(self, connected: bool) -> None:
        """Marca si la senal esta llegando (conexion con el broker).

        No cambia `sermo`: perder el broker no significa que el reactor se
        haya detenido. Se conserva el ultimo valor conocido y se avisa que
        puede estar desactualizado.
        """
        if connected == self._source_connected:
            return
        self._source_connected = connected
        logger.info(
            "Senal SERMO %s.", "restablecida" if connected else "sin conexion al broker"
        )
        await self._notify()

    async def reconcile_on_startup(self) -> None:
        """Cierra la operacion que haya quedado abierta de una corrida previa.

        Si el backend se reinicio mientras el reactor operaba, en la base
        quedo una operacion abierta a la que ya nadie le escribe muestras.
        Dejarla abierta la haria pasar por "en curso" indefinidamente; peor,
        el mensaje retenido de SERMO volveria a llegar como ON y, por ser
        idempotente, no reabriria nada.

        CONSECUENCIA ACEPTADA: reiniciar el backend en medio de un ensayo lo
        parte en dos operaciones historicas. Es visible y honesto -- el hueco
        de muestras existio de verdad. La alternativa (retomar la misma
        operacion al recibir el retenido) queda documentada como descartada
        para el MVP en el ADR 0004.
        """
        stale = await asyncio.to_thread(self._repository.find_open)
        if stale is None:
            return

        closed = await asyncio.to_thread(self._repository.close_open)
        logger.warning(
            "Operacion %s quedo abierta de una corrida anterior: se cierra al arrancar.",
            closed["id"] if closed else stale["id"],
        )

    # -- Interno ----------------------------------------------------------
    async def _apply_or_defer(self, transition: _Transition) -> bool:
        """Aplica la transicion o la deja pendiente si falla la base. Con lock."""
        try:
            changed = await self._apply(transition)
        except SQLAlchemyError as error:
            # Antes este error subia hasta el suscriptor MQTT, que se
            # reconectaba al broker para que el retenido trajera la senal de
            # nuevo. Funcionaba de casualidad y mostraba "sin senal" al
            # frontend aunque el broker estuviera bien: la caida es de la
            # base, y el reintento se resuelve aca.
            self._pending = transition
            if self._retry_task is None:
                self._retry_task = asyncio.create_task(
                    self._retry_pending(), name="reactor-state-retry"
                )
            logger.warning(
                "No se pudo aplicar SERMO %s: la base no responde (%s). Se reintenta.",
                "ON" if transition.sermo else "OFF",
                type(error).__name__,
            )
            return False

        if changed and transition.timestamped:
            delay = (datetime.now(UTC) - transition.occurred_at).total_seconds()
            # Es la medicion de RNF01 para la deteccion: desde que la FPGA
            # publico hasta que la transicion quedo aplicada. Supone relojes
            # sincronizados entre la FPGA y el servidor.
            logger.info(
                "SERMO %s aplicado %.0f ms despues de publicado.",
                "ON" if transition.sermo else "OFF",
                delay * 1000,
            )
        return changed

    async def _apply(self, transition: _Transition) -> bool:
        if transition.sermo == self._sermo:
            return False

        if transition.sermo:
            await self._start_operation(transition.occurred_at, transition.metadata)
        else:
            await self._end_operation(transition.occurred_at)

        self._sermo = transition.sermo
        self._updated_at = transition.occurred_at
        return True

    async def _retry_pending(self) -> None:
        """Reintenta la transicion pendiente con backoff hasta que entre.

        Termina sola cuando ya no queda nada pendiente: porque se aplico o
        porque una senal nueva la volvio innecesaria. El reconectar a la base
        lo hace el pool de SQLAlchemy (pool_pre_ping) en el proximo intento.
        """
        delay = self._retry_min
        while True:
            await asyncio.sleep(delay)
            async with self._lock:
                transition, self._pending = self._pending, None
                changed = False
                if transition is not None:
                    changed = await self._apply_or_defer(transition)
                done = self._pending is None
                if done:
                    # Se suelta con el lock tomado: si no, una senal que
                    # fallara justo ahora veria la tarea todavia viva, no
                    # crearia otra y su transicion quedaria sin reintento.
                    self._retry_task = None

            if changed:
                logger.info("Base recuperada: transicion de SERMO aplicada con retraso.")
                await self._notify()
            if done:
                return
            delay = min(delay * 2, self._retry_max)

    def _interrupted_end(self, superseded: _Transition | None, incoming: _Transition) -> bool:
        """True si llega un ON mientras un OFF esperaba a la base.

        Ese OFF ya habia cortado la toma de datos (se corta antes de cerrar la
        operacion, y lo que fallo fue el cierre), asi que el estado aplicado
        sigue en ON pero sin muestras. Ignorar el ON por idempotencia dejaria
        un ensayo entero sin registrar.
        """
        return (
            superseded is not None
            and not superseded.sermo
            and incoming.sermo
            and self._sermo
        )

    async def _resume_acquisition(self) -> None:
        if self._operation_id is None or self._operation_started_at is None:
            return
        logger.warning(
            "SERMO volvio a ON antes de poder cerrar %s: se retoma la toma de datos.",
            self._operation_id,
        )
        await self._acquisition.start(self._operation_id, self._operation_started_at)

    async def _start_operation(self, started_at: datetime, metadata: object | None) -> None:
        name = _attr(metadata, "name") or _default_operation_name(started_at)
        operator = _attr(metadata, "operator") or self._default_operator
        notes = _attr(metadata, "notes") or self._default_notes

        operation = await asyncio.to_thread(
            self._repository.open,
            name=name,
            operator=operator,
            notes=notes,
            started_at=started_at,
        )
        self._operation_id = operation["id"]
        self._operation_started_at = operation["started_at"]
        logger.info("SERMO ON: operacion %s abierta (%s).", operation["id"], name)
        await self._acquisition.start(operation["id"], operation["started_at"])

    async def _end_operation(self, ended_at: datetime) -> None:
        # Primero se corta la toma de datos y despues se cierra la operacion:
        # al reves, el bucle podria insertar una muestra con timestamp
        # posterior al `ended_at`, y una muestra fuera del intervalo de su
        # propia operacion rompe las consultas de RF05/RF06.
        await self._acquisition.stop()
        closed = await asyncio.to_thread(self._repository.close_open, ended_at)
        if closed is None:
            logger.warning("SERMO OFF sin operacion abierta en la base.")
        else:
            logger.info("SERMO OFF: operacion %s cerrada.", closed["id"])
        self._operation_id = None
        self._operation_started_at = None

    async def _notify(self) -> None:
        if not self._listeners:
            return
        state = self.get_current_state()
        for listener in self._listeners:
            try:
                await listener(state)
            except Exception:  # pragma: no cover - defensivo
                # Un observador roto (por ejemplo un socket muerto) no puede
                # impedir que el resto se entere del cambio.
                logger.exception("Listener de reactor.state fallo.")


def _default_operation_name(started_at: datetime) -> str:
    """Nombre por defecto cuando la senal no trae metadatos.

    PENDIENTE: la FPGA no sabe como se llama el ensayo ni quien lo conduce, y
    el sistema es de solo lectura, asi que hoy no hay forma de que un operador
    lo nombre. Queda como deuda para el equipo (ver ADR 0004).
    """
    return f"Operacion {started_at.strftime('%d/%m/%Y %H:%M')}"


def _attr(metadata: object | None, field: str) -> str | None:
    if metadata is None:
        return None
    value = getattr(metadata, field, None)
    return value or None


def _as_utc(value: datetime | None) -> datetime | None:
    """Normaliza a UTC. Un timestamp sin zona se asume UTC.

    La FPGA puede publicar un ISO-8601 sin offset; mezclarlo con datetimes
    aware al restar fechas lanza TypeError, y `operations.started_at` es
    `DateTime(timezone=True)`.
    """
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)
