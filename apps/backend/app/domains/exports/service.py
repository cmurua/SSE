class ExportsService:
    def __init__(self, audit_service):
        self._audit_service = audit_service

    def log_export(self, user: str, operation_id: str | None, variables: list[str]) -> None:
        raise NotImplementedError
