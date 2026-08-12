# Fixtures compartidas (client de test, sesion de DB en memoria/sqlite para
# unit tests, MockCredentialsProvider). TODO: implementar cuando existan
# los primeros tests reales.
import pytest


@pytest.fixture
def mock_credentials_provider():
    from app.domains.auth.adapters.mock_provider import MockCredentialsProvider
    return MockCredentialsProvider()
