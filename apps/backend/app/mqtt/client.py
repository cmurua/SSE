# Suscriptor MQTT del topico SERMO: se conecta al broker, escucha y entrega
# cada mensaje ya parseado al handler que le pasen. No decide nada sobre el
# reactor -- eso es de domains/reactor_state -- y no se cae solo: ante un corte
# reintenta con backoff, porque el broker y el backend se reinician por su
# cuenta en desarrollo y en produccion.
from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable

import aiomqtt

from app.mqtt.schemas import InvalidSermoPayloadError, SermoSignal, parse_sermo_payload

logger = logging.getLogger(__name__)

SermoHandler = Callable[[SermoSignal], Awaitable[None]]
ConnectionHandler = Callable[[bool], Awaitable[None]]


class SermoSubscriber:
    """Mantiene viva la suscripcion al topico SERMO.

    `run()` no termina por si solo: se cancela desde el lifespan de la app
    (ver app/composition.py). Cada vuelta del bucle es una conexion al broker;
    cuando se corta, espera y vuelve a intentar.
    """

    def __init__(
        self,
        *,
        hostname: str,
        port: int,
        topic: str,
        qos: int,
        on_signal: SermoHandler,
        on_connection_change: ConnectionHandler | None = None,
        username: str | None = None,
        password: str | None = None,
        identifier: str | None = None,
        keepalive: int = 60,
        reconnect_min_seconds: float = 1.0,
        reconnect_max_seconds: float = 30.0,
    ) -> None:
        self._hostname = hostname
        self._port = port
        self._topic = topic
        self._qos = qos
        self._on_signal = on_signal
        self._on_connection_change = on_connection_change
        self._username = username
        self._password = password
        self._identifier = identifier
        self._keepalive = keepalive
        self._reconnect_min = reconnect_min_seconds
        self._reconnect_max = reconnect_max_seconds
        self._connected = False

    @property
    def connected(self) -> bool:
        """Si hay conexion viva con el broker.

        Importa distinguirlo del valor de SERMO: sin broker el backend no sabe
        si el reactor opera, que no es lo mismo que saber que esta detenido.
        El ultimo valor conocido se conserva, marcado como no confiable.
        """
        return self._connected

    async def run(self) -> None:
        delay = self._reconnect_min
        while True:
            try:
                await self._session()
                # Salida limpia del `async with` sin excepcion: el broker
                # cerro la conexion. Se reintenta igual que ante un error.
                delay = self._reconnect_min
            except asyncio.CancelledError:
                await self._set_connected(False)
                raise
            except aiomqtt.MqttError as error:
                logger.warning(
                    "Conexion MQTT perdida (%s). Reintento en %.0fs.", error, delay
                )
            except Exception:  # pragma: no cover - defensivo
                # Un bug en el handler no puede matar la ingesta: sin este
                # bucle vivo el sistema queda ciego a SERMO hasta el proximo
                # reinicio del backend.
                logger.exception("Error inesperado en la suscripcion MQTT.")

            await self._set_connected(False)
            await asyncio.sleep(delay)
            # Backoff exponencial acotado: un broker caido no merece un
            # reintento por segundo indefinidamente, pero tampoco queremos
            # tardar minutos en recuperar la senal cuando vuelve.
            delay = min(delay * 2, self._reconnect_max)

    async def _session(self) -> None:
        async with aiomqtt.Client(
            hostname=self._hostname,
            port=self._port,
            username=self._username,
            password=self._password,
            identifier=self._identifier,
            keepalive=self._keepalive,
        ) as client:
            # Suscribirse ANTES de marcar la conexion como buena: entre el
            # connect y el subscribe todavia no llegaria ningun mensaje.
            await client.subscribe(self._topic, qos=self._qos)
            await self._set_connected(True)
            logger.info(
                "Suscripto a MQTT %s:%s topico '%s' (QoS %s).",
                self._hostname,
                self._port,
                self._topic,
                self._qos,
            )

            async for message in client.messages:
                await self._dispatch(message.payload)

    async def _dispatch(self, payload: object) -> None:
        if not isinstance(payload, (bytes, bytearray, str)):
            logger.warning("Payload MQTT de tipo inesperado: %s", type(payload).__name__)
            return

        raw = bytes(payload) if isinstance(payload, bytearray) else payload
        try:
            signal = parse_sermo_payload(raw)
        except InvalidSermoPayloadError as error:
            # Se descarta el mensaje y se sigue escuchando: cortar aca haria
            # perder la proxima transicion valida por culpa de una invalida.
            logger.warning("Mensaje SERMO descartado: %s", error)
            return

        await self._on_signal(signal)

    async def _set_connected(self, value: bool) -> None:
        if self._connected == value:
            return
        self._connected = value
        if self._on_connection_change is not None:
            await self._on_connection_change(value)
