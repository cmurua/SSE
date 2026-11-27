# El mismo cliente HTTP que los tests de historicos: la app con get_db()
# reemplazado por la sesion transaccional del test.
from tests.domains.historicals.conftest import client  # noqa: F401
