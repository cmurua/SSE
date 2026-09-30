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
from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime

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


class ReactorStateService:
    def __init__(
        self,
        *,
        repository: OperationLifecycleRepository,
        acquisition: AcquisitionController,
        default_operator: str = "Desconocido",
        default_notes: str | None = None,
    ) -> None:
        self._repository = repository
        self._acquisition = acquisition
        self._default_operator = default_operator
        self._default_notes = default_notes

        self._sermo = False
        self._operation_id: str | None = None
        self._updated_at = datetime.now(UTC)
        self._source_connected = False
        self._listeners: list[StateListener] = []
        # Las transiciones abren/cierran operaciones y arrancan/paran tareas.
        # Dos mensajes juntos (una FPGA que rebota, un retenido que llega
        # pegado a uno nuevo) no pueden ejecutarse entrelazados.
        self._lock = asyncio.Lock()

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
        """
        async with self._lock:
            if sermo == self._sermo:
                return False

            occurred_at = _as_utc(occurred_at) or datetime.now(UTC)
            if sermo:
                await self._start_operation(occurred_at, metadata)
            else:
                await self._end_operation(occurred_at)

            self._sermo = sermo
            self._updated_at = occurred_at

        await self._notify()
        return True

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
