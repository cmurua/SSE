# Composition root de autenticacion: elige que CredentialsProvider usar
# (hoy: ExternalApiCredentialsProvider) y expone get_current_user() para
# proteger endpoints REST. Cambiar de proveedor (p. ej. a SSO real en el
# futuro) es editar SOLO este archivo.
from app.domains.auth.adapters.external_api_provider import ExternalApiCredentialsProvider

# from app.domains.auth.adapters.sso import SsoCredentialsProvider  # futuro


def get_credentials_provider():
    return ExternalApiCredentialsProvider()


def get_current_user(token: str):
    raise NotImplementedError("Pendiente: decodificar JWT y resolver el usuario actual")
