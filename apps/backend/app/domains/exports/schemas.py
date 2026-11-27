from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.domains.reactor_data.variable_catalog import REACTOR_VARIABLES_BY_ID

# Las del grafico (RF05: hasta 2).
MAX_IMAGE_VARIABLES = 2


class ExportLogRequest(BaseModel):
    """Cuerpo de POST /exports/log: una imagen que el navegador ya genero.

    Solo PNG: el CSV lo arma el backend (GET .../samples.csv) y se registra
    ahi mismo, asi que no hace falta que el frontend lo informe (y no queda
    registrado dos veces).
    """

    model_config = ConfigDict(extra="forbid")

    format: Literal["png"]
    source: Literal["realtime", "historicals"] = Field(
        description="Pantalla desde la que se exporto."
    )
    operation_id: str | None = Field(default=None, max_length=100)
    variables: list[str] = Field(min_length=1, max_length=MAX_IMAGE_VARIABLES)
    # Ventana del grafico, en segundos desde el inicio de la operacion.
    start: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    end: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    file_name: str = Field(min_length=1, max_length=255)

    @field_validator("variables")
    @classmethod
    def _known_variables(cls, value: list[str]) -> list[str]:
        unknown = [v for v in value if v not in REACTOR_VARIABLES_BY_ID]
        if unknown:
            raise ValueError(f"Variables inexistentes: {', '.join(unknown)}")
        return value

    @model_validator(mode="after")
    def _start_not_after_end(self) -> "ExportLogRequest":
        if self.start is not None and self.end is not None and self.start > self.end:
            raise ValueError("`start` no puede ser posterior a `end`")
        return self
