from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.main import app


@pytest.fixture
def client(db_session: Session) -> Iterator[TestClient]:
    # Sin `with`: no se dispara el lifespan (broker, toma de datos). La base
    # se inyecta reemplazando get_db por la sesion transaccional del test.
    app.dependency_overrides[get_db] = lambda: db_session
    yield TestClient(app)
    app.dependency_overrides.pop(get_db, None)
