# RESERVADO: fuente real de muestras, la PC principal del reactor.
#
# Se deja el archivo creado y sin implementar a proposito, igual que
# domains/auth/adapters/sso/: marca donde va la integracion y evita que la
# decision de pull/push se tome por descarte cuando llegue el momento.
#
# Para habilitarla alcanza con implementar `read()` y poner
# ACQUISITION_SOURCE=main_pc en el .env; nada mas del backend cambia (ver
# app/composition.py).
#
# Falta definir con quien opera la PC principal:
#   - protocolo y direccion (OPC UA, Modbus, socket propio, archivo compartido)
#   - si el backend consulta (pull) o la PC emite (push); ver sources/base.py
#   - el mapeo canal del SIR -> columna de `reactor_samples`, que hoy sale del
#     catalogo provisional de variable_catalog.py (tarea 3.9)
from __future__ import annotations

from app.domains.reactor_data.sources.base import SampleSource, SampleValues


class MainPcSampleSource(SampleSource):
    async def read(self, elapsed_seconds: float) -> SampleValues:
        raise NotImplementedError(
            "Pendiente: definir el protocolo de lectura de la PC principal del reactor."
        )
