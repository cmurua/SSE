# Configuracion de logging estructurado. TODO: definir formato JSON para
# facilitar la correlacion con app/domains/audit (RNF03 - trazabilidad).
import logging
import re
from collections.abc import Iterable

# Loggers que escriben la URL completa, query string incluida: uvicorn.access
# en cada request HTTP y uvicorn.error en cada handshake WebSocket
# ('"WebSocket /ruta?..." [accepted]').
_URL_LOGGERS = ("uvicorn.access", "uvicorn.error")


class RedactQueryParamsFilter(logging.Filter):
    """Enmascara el valor de ciertos parametros de query en los logs.

    Existe por el access token de los WebSocket, que viaja en la URL (ver
    app/websocket/dependencies.py): sin esto, cualquiera con acceso a los logs
    podria reusar una sesion valida.

    Reescribe los argumentos uno por uno en vez de formatear el mensaje,
    porque el AccessFormatter de uvicorn espera `record.args` como la tupla
    original de cinco elementos.
    """

    def __init__(self, params: Iterable[str]) -> None:
        super().__init__()
        names = "|".join(re.escape(param) for param in params)
        self._pattern = re.compile(rf"([?&](?:{names})=)[^&#\s\"]*")

    def _redact(self, value):
        if isinstance(value, str):
            return self._pattern.sub(r"\1[REDACTED]", value)
        return value

    def filter(self, record: logging.LogRecord) -> bool:
        record.msg = self._redact(record.msg)
        if isinstance(record.args, tuple):
            record.args = tuple(self._redact(arg) for arg in record.args)
        return True


def configure_logging(level: str = "INFO", *, redact_query_params: Iterable[str] = ()) -> None:
    logging.basicConfig(level=level)

    params = tuple(redact_query_params)
    if not params:
        return
    for name in _URL_LOGGERS:
        logger = logging.getLogger(name)
        # Idempotente: con `--reload` o en tests el modulo puede configurarse
        # mas de una vez y no tiene sentido apilar filtros iguales.
        if not any(isinstance(f, RedactQueryParamsFilter) for f in logger.filters):
            logger.addFilter(RedactQueryParamsFilter(params))
