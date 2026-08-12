# Servicio transversal usado por el resto de los dominios para dejar
# trazabilidad (RNF03): accesos, errores, exportaciones, consultas y
# conexiones WebSocket. No expone router propio (no es un modulo con UI).
class AuditService:
    def __init__(self, audit_repository):
        self._audit_repository = audit_repository

    def log_access(self, user: str, ip: str, successful: bool) -> None:
        raise NotImplementedError

    def log_error(self, user: str | None, ip: str, detail: str) -> None:
        raise NotImplementedError

    def log_export(self, user: str, ip: str, detail: str) -> None:
        raise NotImplementedError

    def log_query(self, user: str, ip: str, detail: str) -> None:
        raise NotImplementedError

    def log_ws_connection(self, user: str, ip: str, topic: str, connected: bool) -> None:
        raise NotImplementedError
