# Contrato del WebSocket realtime.samples y de GET /realtime/status. La forma
# de cada mensaje esta documentada en docs/architecture/websocket-protocol.md;
# si cambia algo aca, cambia tambien ese documento y el frontend.
from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class RealtimeStatus(BaseModel):
    enabled: bool
    reason: str | None = None


# --- Cliente -> servidor ------------------------------------------------------


class SubscribeMessage(BaseModel):
    """Reemplaza la seleccion de variables del cliente.

    Es la seleccion completa y no un agregado: mandar `[]` deja de recibir
    muestras sin cortar la conexion. Asi el cliente no tiene que llevar la
    cuenta de que pidio antes.
    """

    type: Literal["subscribe"]
    variables: list[str]


# --- Servidor -> cliente (`data` de cada evento) ------------------------------


class RealtimeSubscription(BaseModel):
    """`data` de `subscribed`: la seleccion vigente y la operacion en curso.

    Se manda al conectarse (con `variables` vacio) y como respuesta a cada
    `subscribe` aceptado.
    """

    operation_id: str
    variables: list[str]


class RealtimeSample(BaseModel):
    """`data` de `sample`: una muestra recortada a la seleccion del cliente.

    `values` va por ID del catalogo (GET /reactor-data/variables), no por
    columna de la base. `null` = el canal no publico nada en esa muestra,
    que no es lo mismo que un 0 medido.
    """

    operation_id: str
    timestamp: datetime
    values: dict[str, float | None]


class RealtimeError(BaseModel):
    """`data` de `error`: un pedido del cliente que no se pudo atender."""

    code: str
    message: str
