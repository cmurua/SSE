from datetime import date, datetime

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    computed_field,
    field_validator,
    model_validator,
)

from app.domains.reactor_data.variable_catalog import REACTOR_VARIABLES_BY_ID
from app.domains.realtime.schemas import RealtimeSample

# Tope de `page_size`: con 100 filas la respuesta sigue siendo chica y la
# consulta agrupada de muestras se mantiene acotada (ver repository.py).
MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 20

# Variables por pedido de series: las 2 del grafico mas las del panel del
# nucleo (POSBC1 a POSBC4 hoy), con margen.
MAX_SAMPLE_VARIABLES = 8
# Puntos por serie. 2000 alcanzan para el ancho de un grafico en pantalla; el
# tope evita pedir la tabla entera de una operacion larga sin reducir.
DEFAULT_MAX_POINTS = 2000
MIN_MAX_POINTS = 2
MAX_MAX_POINTS = 10_000


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


class OperationDetail(OperationListItem):
    """Detalle de una operacion cerrada (RF06).

    `first_sample_at` y `last_sample_at` son None si la operacion no tiene
    muestras.
    """

    first_sample_at: datetime | None
    last_sample_at: datetime | None


def parse_variable_ids(raw: str) -> tuple[str, ...]:
    """`"A, B,A"` -> `("A", "B")`: sin duplicados y en el orden pedido."""
    return tuple(dict.fromkeys(part.strip() for part in raw.split(",")))


def validate_variable_ids(raw: str, limit: int | None = None) -> str:
    """Comprueba la lista separada por comas de `variables`; devuelve `raw`."""
    variable_ids = parse_variable_ids(raw)
    if "" in variable_ids:
        raise ValueError("`variables` no puede tener elementos vacios")
    unknown = [v for v in variable_ids if v not in REACTOR_VARIABLES_BY_ID]
    if unknown:
        raise ValueError(f"Variables inexistentes: {', '.join(unknown)}")
    if limit is not None and len(variable_ids) > limit:
        raise ValueError(f"Se pueden pedir hasta {limit} variables a la vez")
    return raw


class SampleWindowParams(BaseModel):
    """La ventana [start, end) que comparten las series y el CSV.

    `start` y `end` son segundos desde el inicio de la operacion. Sin `start`,
    la ventana arranca al inicio; sin `end`, termina con la operacion. Un
    `end` posterior al cierre se recorta.
    """

    model_config = ConfigDict(extra="forbid")

    # Sin `inf` ni `nan`: no son un instante de la operacion.
    start: float | None = Field(
        default=None,
        ge=0,
        allow_inf_nan=False,
        description="Inicio de la ventana, en segundos desde el inicio de la operacion.",
    )
    end: float | None = Field(
        default=None,
        gt=0,
        allow_inf_nan=False,
        description="Fin de la ventana (exclusivo), en segundos desde el inicio de la operacion.",
    )

    @model_validator(mode="after")
    def _start_before_end(self) -> "SampleWindowParams":
        if self.start is not None and self.end is not None and self.start >= self.end:
            raise ValueError("`start` tiene que ser anterior a `end`")
        return self


class OperationSamplesParams(SampleWindowParams):
    """Parametros de GET /historicals/operations/{operation_id}/samples."""

    # Un solo parametro separado por comas (`variables=LOGA1,POTM4`) y no el
    # parametro repetido: la URL queda corta y el orden es explicito.
    variables: str = Field(
        description=(
            "IDs del catalogo separados por comas (GET /reactor-data/variables), "
            f"hasta {MAX_SAMPLE_VARIABLES}."
        ),
    )
    max_points: int = Field(
        default=DEFAULT_MAX_POINTS,
        ge=MIN_MAX_POINTS,
        le=MAX_MAX_POINTS,
        description="Si la ventana tiene mas muestras, se promedian por intervalos.",
    )

    @field_validator("variables")
    @classmethod
    def _known_variables(cls, value: str) -> str:
        return validate_variable_ids(value, MAX_SAMPLE_VARIABLES)

    @property
    def variable_ids(self) -> tuple[str, ...]:
        return parse_variable_ids(self.variables)


class OperationSamplesCsvParams(SampleWindowParams):
    """Parametros de GET /historicals/operations/{operation_id}/samples.csv.

    A diferencia de las series, sin tope de variables ni reduccion de puntos:
    el CSV es la tabla completa de la ventana. Sin `variables` (o vacio) van
    todas las del catalogo.
    """

    variables: str | None = Field(
        default=None,
        description=(
            "IDs del catalogo separados por comas. Sin el, todas las variables del catalogo."
        ),
    )

    @field_validator("variables")
    @classmethod
    def _known_variables(cls, value: str | None) -> str | None:
        if value is None or value.strip() == "":
            return None
        return validate_variable_ids(value)

    @property
    def variable_ids(self) -> tuple[str, ...] | None:
        """Las pedidas, o None si se pide el catalogo entero."""
        return None if self.variables is None else parse_variable_ids(self.variables)


class OperationSamples(BaseModel):
    """Series de una operacion cerrada en una ventana de tiempo.

    Cada muestra tiene la misma forma que el evento `sample` de
    realtime.samples, asi el frontend reusa el buffer y los tipos de Tiempo
    Real. Con `downsampled`, cada muestra es el promedio de un intervalo de
    `bucket_seconds` y su `timestamp` es el inicio del intervalo; un intervalo
    sin muestras no aparece.
    """

    operation_id: str
    variables: list[str]
    # Ventana aplicada, ya recortada a la duracion de la operacion.
    start: float
    end: float
    downsampled: bool
    bucket_seconds: float | None
    samples: list[RealtimeSample]
