# Composition root de los procesos de fondo: ingesta de la senal SERMO por
# MQTT + toma de datos del reactor.
#
# Es el unico archivo que sabe que adaptador concreto se usa. Cambiar la
# fuente de muestras (simulada -> PC principal) o el broker es editar aca y el
# .env; ningun dominio se entera. Mismo criterio que
# domains/auth/dependencies.py para el proveedor de credenciales.
from __future__ import annotations

import asyncio
import logging

from app.config.settings import Settings
from app.db.session import SessionLocal
from app.domains.reactor_data.acquisition import AcquisitionService
from app.domains.reactor_data.repository import ReactorSampleRepository
from app.domains.reactor_data.sources.base import SampleSource
from app.domains.reactor_data.sources.main_pc import MainPcSampleSource
from app.domains.reactor_data.sources.simulated import SimulatedSampleSource
from app.domains.reactor_state.repository import OperationLifecycleRepository
from app.domains.reactor_state.service import ReactorStateService

logger = logging.getLogger(__name__)

SAMPLE_SOURCES: dict[str, type[SampleSource]] = {
    "simulated": SimulatedSampleSource,
    "main_pc": MainPcSampleSource,
}


def build_sample_source(settings: Settings) -> SampleSource:
    try:
        source_class = SAMPLE_SOURCES[settings.acquisition_source]
    except KeyError:
        valid = ", ".join(sorted(SAMPLE_SOURCES))
        raise ValueError(
            f"ACQUISITION_SOURCE='{settings.acquisition_source}' no existe. Valores: {valid}."
        ) from None
    return source_class()


class ReactorRuntime:
    """Ata el suscriptor MQTT, el estado del reactor y la toma de datos.

    Su ciclo de vida es el de la app: lo arranca y lo detiene el lifespan de
    FastAPI (ver app/main.py). Se expone en `app.state.reactor_runtime` para
    que los routers puedan leer el estado sin volver a construir nada.
    """

    def __init__(
        self,
        *,
        state_service: ReactorStateService,
        acquisition: AcquisitionService,
        subscriber=None,
    ) -> None:
        self.state = state_service
        self.acquisition = acquisition
        self.subscriber = subscriber
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        # Antes que nada: cerrar lo que haya quedado abierto de una corrida
        # anterior, para no arrancar con una operacion fantasma en curso.
        try:
            await self.state.reconcile_on_startup()
        except Exception:
            # La base puede no estar migrada todavia (primer `docker compose
            # up`, antes de `alembic upgrade head`) o no responder por un
            # instante. Eso no puede impedir que la API levante: el login y
            # los historicos no tienen por que caerse porque la ingesta no
            # pudo reconciliar. Si quedo una operacion abierta, el proximo
            # SERMO ON la reutiliza en vez de abrir otra (ver
            # OperationLifecycleRepository.open).
            logger.exception(
                "No se pudo reconciliar el estado del reactor al arrancar. "
                "La API sigue levantada; revisar migraciones y conexion a la base."
            )

        if self.subscriber is None:
            logger.warning(
                "Ingesta MQTT deshabilitada (MQTT_ENABLED=false): "
                "el reactor se vera siempre como detenido."
            )
            return

        self._task = asyncio.create_task(self.subscriber.run(), name="mqtt-sermo")

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

        await self.state.shutdown()

        # La toma de datos se corta SIN cerrar la operacion: apagar el backend
        # no significa que el reactor se haya detenido. La operacion queda
        # abierta y el proximo arranque la reconcilia (ver
        # ReactorStateService.reconcile_on_startup).
        await self.acquisition.stop()


def build_reactor_runtime(settings: Settings) -> ReactorRuntime:
    acquisition = AcquisitionService(
        source=build_sample_source(settings),
        repository=ReactorSampleRepository(SessionLocal),
        interval_seconds=settings.acquisition_interval_seconds,
        retry_max_seconds=settings.db_retry_max_seconds,
        max_pending_samples=settings.acquisition_max_pending_samples,
    )
    state_service = ReactorStateService(
        repository=OperationLifecycleRepository(SessionLocal),
        acquisition=acquisition,
        default_operator=settings.acquisition_default_operator,
        default_notes=settings.acquisition_default_notes,
        retry_min_seconds=settings.db_retry_min_seconds,
        retry_max_seconds=settings.db_retry_max_seconds,
    )

    subscriber = None
    if settings.mqtt_enabled:
        # Import local: aiomqtt solo hace falta si la ingesta esta activa, y
        # asi los tests que no la usan no dependen del paquete.
        from app.mqtt.client import SermoSubscriber

        subscriber = SermoSubscriber(
            hostname=settings.mqtt_host,
            port=settings.mqtt_port,
            topic=settings.mqtt_topic_sermo,
            qos=settings.mqtt_qos,
            on_signal=state_service.apply_signal,
            on_connection_change=state_service.set_source_connected,
            username=settings.mqtt_username,
            password=settings.mqtt_password,
            identifier=settings.mqtt_client_id,
            keepalive=settings.mqtt_keepalive_seconds,
            reconnect_min_seconds=settings.mqtt_reconnect_min_seconds,
            reconnect_max_seconds=settings.mqtt_reconnect_max_seconds,
        )

    return ReactorRuntime(
        state_service=state_service, acquisition=acquisition, subscriber=subscriber
    )
