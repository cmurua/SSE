# Persistencia de RefreshToken y LoginAttempt (SQLAlchemy). Stub.
class TokenRepository:
    def __init__(self, db):
        self._db = db


class LoginAttemptRepository:
    def __init__(self, db):
        self._db = db

    def count_recent_failures(self, username: str) -> int:
        raise NotImplementedError
