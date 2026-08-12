# Configuracion de logging estructurado. TODO: definir formato JSON para
# facilitar la correlacion con app/domains/audit (RNF03 - trazabilidad).
import logging


def configure_logging(level: str = "INFO") -> None:
    logging.basicConfig(level=level)
