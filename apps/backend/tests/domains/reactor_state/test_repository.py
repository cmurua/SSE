# OperationLifecycleRepository contra Postgres (ver tests/conftest.py).
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.domains.historicals.models import Operation
from app.domains.reactor_state.repository import OperationLifecycleRepository


def _repository(db_session: Session) -> OperationLifecycleRepository:
    # El repositorio abre y cierra su propia sesion en cada llamada: se le da
    # una nueva sobre la misma conexion, asi ve los datos del test y el
    # rollback del final los borra igual.
    connection = db_session.connection()
    return OperationLifecycleRepository(
        lambda: Session(bind=connection, join_transaction_mode="create_savepoint")
    )


def _operation(operation_id: str, started_at: datetime, ended_at: datetime | None) -> Operation:
    return Operation(
        id=operation_id,
        name=operation_id,
        started_at=started_at,
        ended_at=ended_at,
        operator="Desconocido",
        notes=None,
    )


def test_last_ended_at_sin_operaciones_es_none(db_session: Session):
    assert _repository(db_session).last_ended_at() is None


def test_last_ended_at_es_el_cierre_mas_reciente_e_ignora_la_abierta(db_session: Session):
    db_session.add_all(
        [
            _operation(
                "OP-2026-001",
                datetime(2026, 11, 18, 20, 0, tzinfo=UTC),
                datetime(2026, 11, 18, 20, 30, tzinfo=UTC),
            ),
            _operation(
                "OP-2026-002",
                datetime(2026, 11, 18, 21, 0, tzinfo=UTC),
                datetime(2026, 11, 18, 22, 56, 9, tzinfo=UTC),
            ),
            _operation("OP-2026-003", datetime(2026, 11, 18, 23, 0, tzinfo=UTC), None),
        ]
    )
    db_session.flush()

    assert _repository(db_session).last_ended_at() == datetime(
        2026, 11, 18, 22, 56, 9, tzinfo=UTC
    )
