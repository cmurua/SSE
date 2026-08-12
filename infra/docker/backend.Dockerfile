# Imagen de desarrollo del backend FastAPI. Falta imagen multi-stage de
# produccion (ver docs/architecture/overview.md, seccion "evoluciones futuras").
FROM python:3.12-slim

WORKDIR /app

COPY pyproject.toml ./
RUN pip install --no-cache-dir -e .

COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
