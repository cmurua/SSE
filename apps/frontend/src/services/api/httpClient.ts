// Wrapper unico de fetch: agrega el access token, y ante un 401 intenta
// refrescar con el refresh token (features/auth) antes de reintentar.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export const httpClient = {
  get: (_path: string, _opts?: { params?: Record<string, unknown> }) => {
    throw new Error("TODO: implementar GET con manejo de access/refresh token");
  },
  post: (_path: string, _body: unknown) => {
    throw new Error("TODO: implementar POST con manejo de access/refresh token");
  },
};
