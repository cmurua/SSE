# Proveedor falso para desarrollo local y tests unitarios (no requiere
# conectividad con el modulo externo de credenciales).
from app.domains.auth.adapters.base import CredentialsProvider


class MockCredentialsProvider(CredentialsProvider):
    def verify(self, username: str, password: str) -> dict | None:
        if username and password:
            return {"username": username, "name": username.split("@")[0]}
        return None
