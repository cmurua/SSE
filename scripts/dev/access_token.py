#!/usr/bin/env python3
"""Emite un access token de DESARROLLO, mientras no exista el login.

Sin POST /auth/login (tareas 1.4 y 1.5) no hay forma de obtener un token, y
todo lo protegido -- REST y WebSocket -- rechaza sin uno. Este script lo firma
con el mismo secreto que usa el backend, asi que el backend lo acepta como si
hubiera salido de un login.

    docker compose exec backend python /scripts/dev/access_token.py
    docker compose exec backend python /scripts/dev/access_token.py --minutes 60 --user ana

El token se imprime solo, para poder copiarlo a VITE_DEV_ACCESS_TOKEN en
apps/frontend/.env (ver apps/frontend/src/services/api/devSession.ts).

Vida larga por defecto (8 h): no hay refresh token, asi que al vencer la
sesion se termina. Usar `--minutes 1` para probar el cierre 4401.
"""
from __future__ import annotations

import argparse
import os
import sys


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--user", default="dev", help="claim `sub` (default: dev)")
    parser.add_argument(
        "--minutes", type=int, default=480, help="vida del token en minutos (default: 480)"
    )
    args = parser.parse_args()
    if args.minutes <= 0:
        parser.error("--minutes tiene que ser mayor que 0")

    # La vida del token sale de Settings, que lee el entorno al importarse:
    # hay que fijarla ANTES de importar `app`.
    os.environ["ACCESS_TOKEN_EXPIRE_MINUTES"] = str(args.minutes)
    from app.core.security import create_access_token

    print(create_access_token(args.user))
    return 0


if __name__ == "__main__":
    sys.exit(main())
