"""una sola operacion abierta a la vez

Revision ID: a1c3f7d2e910
Revises: 11ffb005c5e9
Create Date: 2026-09-30 12:00:00.000000

"""
import sqlalchemy as sa
from alembic import op

revision = 'a1c3f7d2e910'
down_revision = '11ffb005c5e9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Hasta ahora "una sola operacion abierta" era una convencion que respetaba
    # el simulador. Desde que la senal SERMO abre operaciones sola (ver
    # docs/decisions/0004-representacion-sermo.md) pasa a ser una invariante
    # del sistema: con dos abiertas, "cual es la operacion en curso" deja de
    # tener respuesta y las muestras de tiempo real no sabrian a cual
    # pertenecen. Se declara en la base y no solo en el codigo porque hay mas
    # de un escritor posible (backend, seed, scripts de mantenimiento).
    #
    # El indice es unico y PARCIAL (solo las filas abiertas; de las cerradas
    # puede haber miles). Se indexa la EXPRESION `(ended_at IS NULL)` y no la
    # columna: en un indice unico de Postgres dos NULL se consideran distintos
    # entre si, asi que `UNIQUE (ended_at) WHERE ended_at IS NULL` no
    # restringiria nada. Sobre las filas incluidas la expresion vale siempre
    # TRUE, de modo que unicidad equivale a "como maximo una fila abierta".
    op.create_index(
        'uq_operations_una_abierta',
        'operations',
        [sa.text('(ended_at IS NULL)')],
        unique=True,
        postgresql_where=sa.text('ended_at IS NULL'),
    )


def downgrade() -> None:
    op.drop_index('uq_operations_una_abierta', table_name='operations')
