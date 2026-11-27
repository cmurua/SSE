"""retirar la tabla reports

El modulo de sugerencias y reportes de error (RF08) quedo fuera del alcance
por decision del equipo (tarea 6.1). La tabla nunca se uso: el endpoint
POST /reports era un stub, asi que no se pierden datos.

El downgrade la recrea vacia, con el mismo esquema que tenia en
7004761949fd.

Revision ID: c4e8a1f05b37
Revises: 8a9c3062a7f0
Create Date: 2026-11-27 12:00:00.000000

"""
import sqlalchemy as sa
from alembic import op

revision = 'c4e8a1f05b37'
down_revision = '8a9c3062a7f0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_table('reports')


def downgrade() -> None:
    op.create_table('reports',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('report_type', sa.String(), nullable=False),
    sa.Column('subject', sa.String(), nullable=False),
    sa.Column('message', sa.String(), nullable=False),
    sa.Column('author', sa.String(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
