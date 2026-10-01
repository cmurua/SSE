# Fuente de desarrollo: genera las muestras en vez de leerlas de la PC
# principal del reactor, que es externa al proyecto y no siempre esta
# disponible. Sin esto no se pueden probar RF04 ni RF05.
#
# El generador es el que ya usaba scripts/db/simulator.py (port de
# `generateSeries()` del prototipo de frontend): vive aca y no en el script
# para que la operacion en vivo, los historicos del seed y cualquier prueba
# usen exactamente la misma forma de onda.
from __future__ import annotations

import math

from app.domains.reactor_data.sources.base import SampleSource, SampleValues
from app.domains.reactor_data.variable_catalog import (
    CONSIGNA,
    REACTOR_VARIABLES,
    sample_column,
)


def variable_value(variable: dict, t: float) -> float:
    """Valor de una señal en el segundo `t` de la operacion.

    Port directo de `generateSeries()` del prototipo de frontend
    (docs/design/frontend-prototype/src/mockData.jsx): superposicion de
    senoidales de distinta frecuencia sobre el valor nominal, en vez de ruido
    aleatorio. Eso da curvas suaves y continuas -- una muestra se parece a la
    anterior -- que es lo que hace falta para que los graficos de RF05 se vean
    como una medicion y no como estatica.

    Es determinista: el mismo `t` da siempre el mismo valor, y la semilla sale
    del ID de la señal, asi que cada una tiene su propia fase y no se mueven
    todas en bloque.
    """
    # Las consignas (niveles de disparo, umbral del canal de marcha) no son
    # mediciones: valen lo que configuro un operador y no se mueven solas.
    # Hacerlas oscilar inventaria un fenomeno que no existe y ensuciaria los
    # graficos donde se las usa como linea de referencia.
    if variable["kind"] == CONSIGNA:
        return float(variable["nominal"])

    span = variable["max"] - variable["min"]
    center = variable["nominal"]
    seed = sum(ord(character) for character in variable["id"])

    # Tres armonicos: el lento domina, los rapidos agregan textura.
    noise = (
        math.sin((t + seed) * 0.21) * 0.012 * span
        + math.sin((t + seed) * 0.07) * 0.025 * span
        + math.sin((t + seed) * 0.45) * 0.005 * span
    )
    # Deriva de periodo largo, para que la serie no sea perfectamente ciclica.
    drift = math.sin(t * 0.013 + seed * 0.1) * 0.04 * span

    value = center + noise + drift

    # El clamp garantiza que ningun valor salga del rango declarado. Hace
    # falta porque hay señales cuyo nominal esta cerca de un extremo (NN1 y
    # NT1 operan casi llenos).
    return max(variable["min"], min(variable["max"], value))


def sample_values(t: float) -> dict[str, float]:
    """Fila completa de `reactor_samples` (sin id/operacion/timestamp)."""
    return {
        sample_column(variable["id"]): variable_value(variable, t)
        for variable in REACTOR_VARIABLES
    }


class SimulatedSampleSource(SampleSource):
    """Adaptador de desarrollo del puerto SampleSource."""

    async def read(self, elapsed_seconds: float) -> SampleValues:
        return sample_values(elapsed_seconds)
