class ReportsService:
    def __init__(self, report_repository):
        self._report_repository = report_repository

    def create(self, report_type: str, subject: str, message: str, author: str):
        raise NotImplementedError
