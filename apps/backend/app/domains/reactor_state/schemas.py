from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel


class ReactorStatus(StrEnum):
    OPERACION = "OPERACION"
    DETENIDO = "DETENIDO"


class ReactorState(BaseModel):
    """Estado de operacion del reactor tal como lo ve el resto del sistema.

    `status` es redundante con `sermo` a proposito: `sermo` es la senal cruda
    (lo que publica la FPGA) y `status` es como se muestra. Para que no puedan
    desincronizarse, nadie construye este schema a mano: se usa `build()`.
    """

    sermo: bool
    status: ReactorStatus
    updated_at: datetime
    # ID de la operacion en curso. Solo tiene valor cuando sermo = True.
    operation_id: str | None = None
    # Si el backend esta recibiendo la senal. False significa "no se sabe si
    # el reactor opera", que NO es lo mismo que "el reactor esta detenido":
    # `sermo` conserva el ultimo valor conocido y este flag avisa que puede
    # estar desactualizado. El frontend lo necesita para su tercer estado
    # visual (ver issues 2.6 y 2.7).
    source_connected: bool = True

    @classmethod
    def build(
        cls,
        *,
        sermo: bool,
        updated_at: datetime,
        operation_id: str | None = None,
        source_connected: bool = True,
    ) -> "ReactorState":
        return cls(
            sermo=sermo,
            status=ReactorStatus.OPERACION if sermo else ReactorStatus.DETENIDO,
            updated_at=updated_at,
            operation_id=operation_id if sermo else None,
            source_connected=source_connected,
        )
