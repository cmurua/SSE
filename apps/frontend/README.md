# Frontend — SSE RA-0 (React + TypeScript + Vite)

## Desarrollo local

```
npm install
cp .env.example .env
npm run dev
```

### Sesion de desarrollo (mientras no exista el login)

Todo lo protegido (REST y WebSocket) exige un access token, y el login
todavia no funciona (tareas 1.4, 1.5, 1.7 y 1.8). Para probar mientras tanto,
el backend emite un token de desarrollo:

```
docker compose exec backend python /scripts/dev/access_token.py
```

Copiarlo a `VITE_DEV_ACCESS_TOKEN` en `.env` y reiniciar `npm run dev`. Dura
8 h (`--minutes` para cambiarlo); al vencer, la sesion se cierra porque no hay
refresh token. Ver `src/services/api/devSession.ts`.

## Tests

```
npm run test
```

Pantallas portadas desde el prototipo de Claude Design (`SSE V1.zip`):
Home, Login, Realtime, Historicals (ex-"Histories"), Reports
(ex-"Suggestions"), Help, About. Ver `src/features/*` y
`src/components/charts/README.md` para la abstraccion de graficos.
