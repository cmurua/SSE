from datetime import date, datetime

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    computed_field,
    field_validator,
    model_validator,
)

# Tope de `page_size`: con 100 filas la respuesta sigue siendo chica y la
# consulta agrupada de muestras se mantiene acotada (ver repository.py).
MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 20


class OperationSummary(BaseModel):
    id: str
    name: str
    started_at: datetime
    # None mientras la operacion sigue abierta (ver Operation en models.py).
    ended_at: datetime | None
    operator: str

    @computed_field
    @property
    def duration_minutes(self) -> int | None:
        """Duracion de la operacion, o None si todavia no cerro."""
        if self.ended_at is None:
            return None
        return int((self.ended_at - self.started_at).total_seconds() // 60)


class OperationListItem(OperationSummary):
    """Fila del listado de historicos (RF06)."""

    notes: str | None
    sample_count: int


class OperationPage(BaseModel):
    items: list[OperationListItem]
    # Operaciones que cumplen los filtros, sin paginar: con esto el frontend
    # calcula cuantas paginas hay.
    total: int
    page: int
    page_size: int


class OperationSearchParams(BaseModel):
    """Parametros de GET /historicals/operations.

    Es un modelo y no parametros sueltos para que la regla `from <= to` falle
    por el mismo camino que el resto de las validaciones: un 422 con el
    formato estandar de FastAPI, sin armar el error a mano en el router.
    """

    # `extra="forbid"`: un parametro mal escrito (`pagesize`) es un 422 y no
    # un filtro que se ignora en silencio. Sin `populate_by_name`, a
    # proposito: `date_from` no es un segundo nombre valido para `from`.
    model_config = ConfigDict(extra="forbid")

    # `from` es palabra reservada en Python; el alias mantiene el nombre en la
    # URL. Fechas, no instantes: el dia se interpreta en la hora de Cordoba
    # (ver service.local_day_bounds).
    date_from: date | None = Field(
        default=None,
        alias="from",
        description="Primer dia incluido (AAAA-MM-DD, hora de Cordoba).",
    )
    date_to: date | None = Field(
        default=None,
        alias="to",
        description="Ultimo dia incluido (AAAA-MM-DD, hora de Cordoba).",
    )
    q: str | None = Field(
        default=None,
        max_length=100,
        description="Texto a buscar en el id o el nombre, sin distinguir mayusculas.",
    )
    page: int = Field(default=1, ge=1, description="Pagina, empezando en 1.")
    page_size: int = Field(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE)

    @field_validator("q")
    @classmethod
    def _q_without_nul(cls, value: str | None) -> str | None:
        # Postgres no admite el caracter NUL en un texto: sin esto la consulta
        # falla con un 500 en vez de un 422.
        if value is not None and "\x00" in value:
            raise ValueError("`q` no puede contener el caracter NUL")
        return value

    @model_validator(mode="after")
    def _from_not_after_to(self) -> "OperationSearchParams":
        if self.date_from and self.date_to and self.date_from > self.date_to:
            raise ValueError("`from` no puede ser posterior a `to`")
        return self
