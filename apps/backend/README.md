# Backend — SSE RA-0 (FastAPI)

## Desarrollo local

```
python -m venv .venv
.venv\Scripts\activate
pip install -e ".[dev]"
cp .env.example .env
uvicorn app.main:app --reload
```

## Tests

```
pytest
```

Ver la organizacion por dominios en `app/domains/`. Cada dominio agrupa
router, service, schemas, models y repository — no hay carpetas
transversales `controllers/`, `services/`, `models/` a nivel raiz.
