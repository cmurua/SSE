# Base declarativa de SQLAlchemy compartida por todos los modelos de dominio.
import pkgutil
from importlib import import_module
from importlib.util import find_spec

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


def import_models() -> None:
    """Importa cada `app/domains/<dominio>/models.py` para poblar Base.metadata.

    Alembic solo ve las tablas cuyas clases fueron importadas: sin esto el
    autogenerate arranca con una metadata vacia y propone borrar el esquema
    entero. Se descubren por recorrido del paquete y no con una lista fija
    para que un dominio nuevo no requiera tocar este archivo.

    Los imports van dentro de la funcion, no en el encabezado del modulo:
    cada models.py hace `from app.db.base import Base`, asi que importarlos
    a nivel de modulo cerraria un ciclo de imports.
    """
    import app.domains

    prefix = f"{app.domains.__name__}."
    for module in pkgutil.iter_modules(app.domains.__path__, prefix):
        # Varios dominios (help, exports, realtime) no persisten nada todavia.
        if module.ispkg and find_spec(f"{module.name}.models") is not None:
            import_module(f"{module.name}.models")
