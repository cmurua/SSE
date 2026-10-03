# Publica las muestras nuevas via websocket.manager mientras el reactor este
# en modo OPERACION.
#
# Mecanismo decidido en docs/decisions/0006-mecanismo-lectura-tiempo-real.md:
# las muestras NO se leen de Postgres (ni polling ni LISTEN/NOTIFY). Se reciben
# en el mismo proceso registrando un listener con
# AcquisitionService.register_listener(), que avisa cada muestra apenas queda
# guardada. Implementarlo es la tarea 3.2.
class RealtimeService:
    def __init__(self, reactor_state_service, sample_repository):
        self._reactor_state_service = reactor_state_service
        self._sample_repository = sample_repository

    async def stream_latest_samples(self):
        raise NotImplementedError
