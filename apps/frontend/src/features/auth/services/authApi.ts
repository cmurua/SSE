// Unico punto de contacto con /auth/*. No sabe nada del proveedor de
// credenciales que use el backend por detras (modulo externo hoy, SSO
// real en el futuro): eso es transparente para el frontend.
import { httpClient } from "@/services/api/httpClient";

export const authApi = {
  login: (username: string, password: string) =>
    httpClient.post("/auth/login", { username, password }),
  refresh: (refreshToken: string) => httpClient.post("/auth/refresh", { refresh_token: refreshToken }),
  logout: () => httpClient.post("/auth/logout", {}),
};
