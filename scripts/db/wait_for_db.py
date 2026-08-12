# Stub: esperar a que Postgres acepte conexiones antes de correr migraciones.
# TODO: implementar polling real con SQLAlchemy/psycopg cuando se conecte la app a Postgres.

def wait_for_db(url: str, timeout_seconds: int = 30) -> None:
    raise NotImplementedError("Pendiente: implementar espera activa de disponibilidad de PostgreSQL")


if __name__ == "__main__":
    pass
