# Lee las muestras mas recientes de reactor_data y las publica via
# websocket.manager mientras el reactor este en modo OPERACION.
# TODO: definir mecanismo de lectura (polling a intervalos vs.
# LISTEN/NOTIFY de Postgres) - ver ADR pendiente en docs/decisions/.
class RealtimeService:
    def __init__(self, reactor_state_service, sample_repository):
        self._reactor_state_service = reactor_state_service
        self._sample_repository = sample_repository

    async def stream_latest_samples(self):
        raise NotImplementedError
