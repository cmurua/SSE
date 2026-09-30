# Puerto de la toma de datos: de donde salen las muestras del reactor.
#
# DECISION: el puerto modela un PULL (el backend pide la muestra cuando le
# toca) y no un PUSH (la PC principal empuja cuando tiene). Se eligio pull
# porque hace que la cadencia de `reactor_samples` la controle el backend --
# que es quien tiene el requisito de 1 Hz y el de latencia (RNF01) -- en vez
# de depender de como emita el otro extremo.
#
# PENDIENTE de confirmar con quien opera la PC principal: si el protocolo real
# resulta ser push (la PC abre una conexion y va emitiendo), este puerto se
# mantiene pero el adaptador pasa a bufferear internamente y `read()` devuelve
# la ultima muestra recibida. La decision de pull/push NO se filtra al resto
# del backend gracias a esta interfaz.
from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime

# Una muestra: nombre de columna de `reactor_samples` -> valor. None significa
# "el canal no publico nada", que es distinto de un 0 medido (ver el comentario
# de nullable en domains/reactor_data/models.py).
SampleValues = dict[str, float | None]


class SampleSource(ABC):
    """Origen de las muestras de una operacion."""

    async def open(self, operation_id: str, started_at: datetime) -> None:
        """Prepara la fuente al arrancar una operacion. Por defecto no hace nada."""

    @abstractmethod
    async def read(self, elapsed_seconds: float) -> SampleValues:
        """Devuelve la muestra correspondiente al segundo `elapsed_seconds`.

        `elapsed_seconds` es el tiempo transcurrido desde el inicio de la
        operacion, no el indice de la muestra: asi la forma de las series no
        cambia si se ajusta el intervalo de muestreo.
        """

    async def close(self) -> None:
        """Libera recursos al terminar la operacion. Por defecto no hace nada."""
