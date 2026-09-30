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
from app.domains.reactor_data.variable_catalog import REACTOR_VARIABLES, sample_column

# Unidad que marca a una variable como booleana en el catalogo (EST_BOM).
BOOLEAN_UNIT = "0/1"


def variable_value(variable: dict, t: float) -> float:
    """Valor de una variable en el segundo `t` de la operacion.

    Port directo de `generateSeries()` del prototipo de frontend
    (docs/design/frontend-prototype/src/mockData.jsx): superposicion de
    senoidales de distinta frecuencia sobre el valor nominal, en vez de ruido
    aleatorio. Eso da curvas suaves y continuas -- una muestra se parece a la
    anterior -- que es lo que hace falta para que los graficos de RF05 se vean
    como una medicion y no como estatica.

    Es determinista: el mismo `t` da siempre el mismo valor, y la semilla sale
    del ID de la variable, asi que cada una tiene su propia fase y no se mueven
    todas en bloque.
    """
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

    # El clamp garantiza el criterio de aceptacion: ningun valor sale del
    # rango declarado. Hace falta porque hay variables cuyo nominal esta
    # pegado a un extremo (POS_BRS y EST_BOM tienen nominal == max).
    value = max(variable["min"], min(variable["max"], value))

    # Una bomba encendida al 93% no existe: las booleanas se redondean.
    if variable["unit"] == BOOLEAN_UNIT:
        return float(round(value))

    return value


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
