# Contrato que debe cumplir cualquier proveedor de verificacion de
# credenciales, sea el modulo externo actual o el SSO real futuro.
from typing import Protocol


class CredentialsProvider(Protocol):
    def verify(self, username: str, password: str) -> dict | None:
        """Devuelve datos minimos de la identidad si son validas, None si no."""
        ...
