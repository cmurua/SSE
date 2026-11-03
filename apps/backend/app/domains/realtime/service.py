# Publica las muestras nuevas por el WebSocket realtime.samples mientras el
# reactor esta en modo OPERACION (RF04, RF05).
#
# Mecanismo decidido en docs/decisions/0006-mecanismo-lectura-tiempo-real.md:
# las muestras NO se leen de Postgres (ni polling ni LISTEN/NOTIFY). Llegan en
# el mismo proceso por AcquisitionService.register_listener(), que avisa cada
# muestra apenas queda guardada; el lifespan (app/main.py) registra
# publish_sample() ahi y on_state_changed() en ReactorStateService.
#
# "El reactor esta operando" lo decide ReactorStateService y no se recalcula
# aca: este servicio solo le pregunta (ver docs/architecture/overview.md).
#
# Cada cliente elige que variables recibir y recibe SOLO esas: una muestra
# completa son 34 senales por segundo y la pantalla muestra dos.
from __future__ import annotations

import json
import logging
from typing import Protocol

from fastapi import WebSocket, WebSocketException
from pydantic import ValidationError

from app.domains.reactor_data.acquisition import AcquiredSample
from app.domains.reactor_data.variable_catalog import (
    REACTOR_VARIABLES_BY_ID,
    sample_column,
)
from app.domains.reactor_state.schemas import ReactorState
from app.domains.realtime.schemas import (
    RealtimeError,
    RealtimeSample,
    RealtimeStatus,
    RealtimeSubscription,
    SubscribeMessage,
)
from app.websocket.events import WSCloseCode, WSEventType, WSTopic, build_event
from app.websocket.manager import ConnectionManager

logger = logging.getLogger(__name__)

# RF05: "hasta dos variables a la vez". La UI ya lo impone (tarea 3.4); el
# backend lo repite porque es tambien el tope de lo que se envia por cliente.
MAX_SUBSCRIBED_VARIABLES = 2

NOT_OPERATING_REASON = "El reactor no esta en operacion"
OPERATION_ENDED_REASON = "La operacion termino"


class ReactorStateReader(Protocol):
    """Lo unico que este servicio necesita de ReactorStateService."""

    def get_current_state(self) -> ReactorState: ...


class RealtimeService:
    def __init__(
        self,
        *,
        reactor_state: ReactorStateReader,
        manager: ConnectionManager,
        max_variables: int = MAX_SUBSCRIBED_VARIABLES,
    ) -> None:
        self._reactor_state = reactor_state
        self._manager = manager
        self._max_variables = max_variables
        # Seleccion de cada cliente conectado, en el orden en que la pidio.
        # El registro de conexiones es del manager; esto es solo lo que cada
        # una quiere recibir.
        self._subscriptions: dict[WebSocket, tuple[str, ...]] = {}
        # Operacion con la que se admitio a cada cliente. Un cliente nunca
        # cambia de operacion: al terminar, se lo cierra.
        self._operations: dict[WebSocket, str] = {}

    # -- REST -------------------------------------------------------------
    def get_status(self) -> RealtimeStatus:
        state = self._reactor_state.get_current_state()
        if state.sermo:
            return RealtimeStatus(enabled=True)
        return RealtimeStatus(enabled=False, reason=NOT_OPERATING_REASON)

    # -- WebSocket ----------------------------------------------------------
    async def serve(self, websocket: WebSocket) -> None:
        """Atiende una conexion de realtime.samples hasta que se cierra.

        Arranca sin variables: el cliente recibe `subscribed` con la operacion
        en curso y despues elige con `subscribe`. Con el reactor detenido se
        cierra con REACTOR_NOT_OPERATING sin suscribir.
        """
        try:
            await self._manager.serve(
                WSTopic.REALTIME_SAMPLES,
                websocket,
                initial_message=lambda: self._admit(websocket),
                on_text=lambda text: self._on_client_message(websocket, text),
            )
        finally:
            self._subscriptions.pop(websocket, None)
            self._operations.pop(websocket, None)

    def subscription_of(self, websocket: WebSocket) -> tuple[str, ...]:
        return self._subscriptions.get(websocket, ())

    def _admit(self, websocket: WebSocket) -> dict:
        """Decide si el cliente entra. Corre en el mismo paso en que se lo
        suscribe (ver ConnectionManager.connect): si la operacion termina
        antes, se lo rechaza aca; si termina despues, ya esta suscripto y lo
        cierra on_state_changed(). No hay ventana en la que quede colgado."""
        state = self._reactor_state.get_current_state()
        if not state.sermo or state.operation_id is None:
            raise WebSocketException(
                code=WSCloseCode.REACTOR_NOT_OPERATING, reason=NOT_OPERATING_REASON
            )
        self._subscriptions[websocket] = ()
        self._operations[websocket] = state.operation_id
        return _subscribed_event(state.operation_id, ())

    async def _on_client_message(self, websocket: WebSocket, text: str) -> None:
        try:
            message = SubscribeMessage.model_validate(json.loads(text))
        except (ValueError, ValidationError):
            # json.JSONDecodeError es un ValueError.
            await self._reply_error(
                websocket,
                "invalid_message",
                'Se esperaba {"type": "subscribe", "variables": [...]}',
            )
            return

        # Sin duplicados y en el orden pedido: el orden es el de Variable A y
        # Variable B en la UI.
        variables = tuple(dict.fromkeys(message.variables))
        unknown = [v for v in variables if v not in REACTOR_VARIABLES_BY_ID]
        if unknown:
            await self._reply_error(
                websocket, "unknown_variable", f"Variables inexistentes: {', '.join(unknown)}"
            )
            return
        if len(variables) > self._max_variables:
            await self._reply_error(
                websocket,
                "too_many_variables",
                f"Se pueden seguir hasta {self._max_variables} variables a la vez",
            )
            return

        # Un pedido rechazado deja la seleccion anterior intacta; solo uno
        # valido la reemplaza.
        self._subscriptions[websocket] = variables
        await self._manager.send(
            websocket, _subscribed_event(self._operations[websocket], variables)
        )

    async def _reply_error(self, websocket: WebSocket, code: str, message: str) -> None:
        await self._manager.send(
            websocket, build_event(WSEventType.ERROR, RealtimeError(code=code, message=message))
        )

    # -- Listeners ----------------------------------------------------------
    async def publish_sample(self, sample: AcquiredSample) -> None:
        """Listener de AcquisitionService: reparte una muestra recien guardada.

        Cada cliente recibe solo sus variables. El mensaje se arma una vez por
        seleccion distinta, no por cliente: con 100 clientes mirando las
        mismas dos variables se serializa una sola vez.
        """
        if not self._subscriptions:
            return

        by_selection: dict[frozenset[str], dict] = {}

        def message_for(websocket: WebSocket) -> dict | None:
            variables = self._subscriptions.get(websocket)
            if not variables:
                return None
            key = frozenset(variables)
            event = by_selection.get(key)
            if event is None:
                event = by_selection[key] = build_event(
                    WSEventType.SAMPLE,
                    RealtimeSample(
                        operation_id=sample.operation_id,
                        timestamp=sample.timestamp,
                        values={v: sample.values.get(sample_column(v)) for v in variables},
                    ),
                )
            return event

        await self._manager.broadcast_each(WSTopic.REALTIME_SAMPLES, message_for)

    async def on_state_changed(self, state: ReactorState) -> None:
        """Listener de ReactorStateService: al terminar la operacion, corta.

        Llega despues de que la toma de datos se detuvo (ver
        ReactorStateService._end_operation), asi que las ultimas muestras ya
        se repartieron. Perder la senal (source_connected = false) NO corta:
        no se sabe si el reactor se detuvo, y las muestras siguen llegando.
        """
        if state.sermo:
            return
        if self._manager.subscriber_count(WSTopic.REALTIME_SAMPLES) == 0:
            return
        logger.info("Operacion terminada: se cierran los streams de tiempo real.")
        await self._manager.close_topic(
            WSTopic.REALTIME_SAMPLES,
            WSCloseCode.REACTOR_NOT_OPERATING,
            OPERATION_ENDED_REASON,
        )


def _subscribed_event(operation_id: str, variables: tuple[str, ...]) -> dict:
    return build_event(
        WSEventType.SUBSCRIBED,
        RealtimeSubscription(operation_id=operation_id, variables=list(variables)),
    )
