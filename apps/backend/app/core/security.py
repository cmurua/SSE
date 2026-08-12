# Emision/validacion de JWT propio (access + refresh). La verificacion de
# CREDENCIALES (usuario/contrasena) vive en domains/auth/adapters, no aca:
# este modulo solo firma y valida tokens una vez que la identidad ya fue
# aprobada por el proveedor de credenciales correspondiente.
from datetime import datetime, timedelta, timezone

import jwt

from app.config.settings import get_settings

settings = get_settings()


def create_access_token(subject: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    return jwt.encode({"sub": subject, "exp": expire, "type": "access"}, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_refresh_token(subject: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    return jwt.encode({"sub": subject, "exp": expire, "type": "refresh"}, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
