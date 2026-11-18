// Contexto de sesion: usuario, tokens en memoria, isAuthenticated.
// El frontend SOLO conoce /auth/login, /auth/refresh, /auth/logout de
// NUESTRO backend; nunca habla directo con el modulo externo de
// credenciales ni con el futuro SSO real (eso lo resuelve el backend).
import { createContext, useContext, useState, type ReactNode } from "react";
import { setSessionTokens } from "@/services/api/httpClient";

interface AuthContextValue {
  user: { username: string } | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<{ username: string } | null>(null);

  const login = async (_username: string, _password: string) => {
    throw new Error("TODO: llamar a services/api via features/auth/services/authApi.ts");
  };

  // Limpiar los tokens avisa a lo que depende de la sesion: el WebSocket de
  // reactor.state se cierra solo (ver useReactorState). Falta revocar el
  // refresh token en el backend (tarea 1.8).
  const logout = () => {
    setSessionTokens(null);
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthContext debe usarse dentro de AuthProvider");
  return ctx;
}
