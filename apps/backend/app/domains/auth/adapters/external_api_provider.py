# Implementacion CONFIRMADA: delega la validacion de usuario/contrasena en
# un modulo externo e independiente de este proyecto, via su API.
import httpx

from app.config.settings import get_settings
from app.domains.auth.adapters.base import CredentialsProvider

settings = get_settings()


class ExternalApiCredentialsProvider(CredentialsProvider):
    def verify(self, username: str, password: str) -> dict | None:
        raise NotImplementedError(
            "Pendiente: POST a settings.external_auth_api_url con las credenciales "
            "y mapear la respuesta a la identidad del usuario"
        )
