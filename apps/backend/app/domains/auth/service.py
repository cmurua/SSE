# Orquesta el login: delega la verificacion de credenciales al
# CredentialsProvider activo (ver adapters/), aplica el control de
# intentos fallidos (RF03) y emite tokens (core.security).
class AuthService:
    def __init__(self, credentials_provider, token_repository, login_attempt_repository):
        self._credentials_provider = credentials_provider
        self._token_repository = token_repository
        self._login_attempt_repository = login_attempt_repository

    def login(self, username: str, password: str):
        raise NotImplementedError

    def refresh(self, refresh_token: str):
        raise NotImplementedError

    def logout(self, refresh_token: str) -> None:
        raise NotImplementedError
