# Imagen de desarrollo del backend FastAPI. Falta imagen multi-stage de
# produccion (ver docs/architecture/overview.md, seccion "evoluciones futuras").
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Las dependencias se instalan en una capa propia (solo se invalida al cambiar
# pyproject.toml). El paquete `app` todavia no fue copiado, asi que se crea un
# stub para que el install editable resuelva; el codigo real llega en el COPY
# siguiente y, en desarrollo, en el bind mount de docker compose.
COPY pyproject.toml ./
RUN mkdir -p app \
    && touch app/__init__.py \
    && pip install --no-cache-dir -e ".[dev]"

COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
