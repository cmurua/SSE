// Sesion de DESARROLLO, mientras no exista el login (tareas 1.4, 1.5, 1.7 y
// 1.8). Registra como sesion un access token generado por el backend con
// scripts/dev/access_token.py y cargado en VITE_DEV_ACCESS_TOKEN, para poder
// probar lo que exige sesion (REST protegido y WebSocket).
//
// No hay refresh token: cuando el access vence, el primer 401 (o el cierre
// 4401 del WebSocket) termina la sesion. Por eso el script lo emite con una
// vida larga.
//
// Solo actua con `vite dev`: en un build de produccion Vite reemplaza
// `import.meta.env.DEV` por `false` y el minificador descarta el bloque, token
// incluido. Ojo: `NODE_ENV=development` (lo fija la imagen de desarrollo,
// infra/docker/frontend.Dockerfile) hace que `vite build` arme un build de
// desarrollo, y ahi el token SI queda en el bundle.
// Borrar este archivo cuando el login funcione.
import { setSessionTokens } from "./httpClient";

export function startDevSession(): void {
  if (import.meta.env.DEV) {
    const accessToken = import.meta.env.VITE_DEV_ACCESS_TOKEN;
    if (!accessToken) return;

    setSessionTokens({ accessToken, refreshToken: "" });
    console.info("[dev] sesion iniciada con VITE_DEV_ACCESS_TOKEN");
  }
}
