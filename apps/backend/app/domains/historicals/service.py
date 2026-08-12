class HistoricalsService:
    def __init__(self, operation_repository, sample_repository):
        self._operation_repository = operation_repository
        self._sample_repository = sample_repository

    def search_operations(self, date_from=None, date_to=None, operation_id=None):
        raise NotImplementedError
