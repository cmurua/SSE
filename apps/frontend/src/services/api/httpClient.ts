// Unico punto de contacto del frontend con la API REST. Ningun feature debe
// llamar a `fetch` por su cuenta: aca viven la base URL, la inyeccion del
// access token y la renovacion transparente ante un 401.
//
// El cliente es un modulo plano y no un hook, porque lo consumen los services
// de cada feature (features/*/services/*.ts), que no son componentes. Por eso
// la sesion se registra con `setSessionTokens()` en vez de leerse de un
// contexto de React: AuthProvider empuja los tokens aca al iniciar sesion.
import { ENDPOINTS } from "./endpoints";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

/** Error de una respuesta no exitosa. Lleva el status para que el llamador
 *  pueda distinguir un 404 de un 500 sin parsear el mensaje. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    message?: string,
  ) {
    super(message ?? `La API respondio ${status}`);
    this.name = "ApiError";
  }
}

// --------------------------------------------------------------------------
// Sesion en memoria
// --------------------------------------------------------------------------
// Deliberadamente NO en localStorage: un token accesible desde JS es robable
// por cualquier XSS. Vivir en memoria implica que un F5 cierra la sesion, que
// es el precio aceptado hasta que exista una decision sobre cookies httpOnly.
let accessToken: string | null = null;
let refreshToken: string | null = null;
let onAuthFailure: (() => void) | null = null;

export function setSessionTokens(tokens: SessionTokens | null): void {
  accessToken = tokens?.accessToken ?? null;
  refreshToken = tokens?.refreshToken ?? null;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** Callback que se dispara cuando la sesion ya no se puede recuperar (el
 *  refresh fallo). AuthProvider lo usa para forzar el logout y redirigir. */
export function setOnAuthFailure(handler: (() => void) | null): void {
  onAuthFailure = handler;
}

function forceLogout(): void {
  setSessionTokens(null);
  onAuthFailure?.();
}

// --------------------------------------------------------------------------
// Renovacion de token
// --------------------------------------------------------------------------
// Un unico refresh en vuelo a la vez. Si diez requests reciben 401 casi
// simultaneamente, las diez esperan la MISMA promesa en vez de disparar diez
// POST /auth/refresh: esa "tormenta de refresh" no solo es trafico inutil,
// sino que con refresh tokens rotativos las renovaciones concurrentes se
// invalidan entre si y terminan cerrando la sesion.
let refreshInFlight: Promise<string | null> | null = null;

// Endpoints que nunca deben disparar el ciclo de refresh: un 401 en login es
// "credenciales incorrectas", y reintentarlo tras un refresh no tiene sentido.
// El propio /auth/refresh se excluye para no recursar.
const NO_REFRESH_PATHS: readonly string[] = [
  ENDPOINTS.auth.login,
  ENDPOINTS.auth.refresh,
];

async function requestNewAccessToken(): Promise<string | null> {
  if (refreshToken === null) return null;

  // fetch directo y no `request()`: pasar por el cliente haria que un 401 del
  // propio refresh volviera a intentar refrescar, en bucle.
  const response = await fetch(buildUrl(ENDPOINTS.auth.refresh), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!response.ok) return null;

  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
  };
  if (!data.access_token) return null;

  accessToken = data.access_token;
  // El backend puede rotar el refresh token en cada renovacion; si lo hace,
  // quedarse con el viejo dejaria la sesion muerta en la proxima renovacion.
  if (data.refresh_token) refreshToken = data.refresh_token;

  return accessToken;
}

function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight !== null) return refreshInFlight;

  refreshInFlight = requestNewAccessToken()
    .catch(() => null) // Un refresh caido es una sesion no recuperable, no un throw.
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

// --------------------------------------------------------------------------
// Request
// --------------------------------------------------------------------------
export interface RequestOptions {
  params?: Record<string, unknown>;
  signal?: AbortSignal;
}

function buildUrl(path: string, params?: Record<string, unknown>): string {
  const url = `${API_BASE_URL}${path}`;
  if (!params) return url;

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    // Un filtro sin usar no debe viajar como "from=undefined".
    if (value === undefined || value === null || value === "") continue;
    query.append(key, String(value));
  }

  const queryString = query.toString();
  return queryString ? `${url}?${queryString}` : url;
}

async function parseBody(response: Response): Promise<unknown> {
  // 204 y 205 no tienen cuerpo; llamar a .json() ahi tira SyntaxError.
  if (response.status === 204 || response.status === 205) return undefined;

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return await response.text();

  try {
    return await response.json();
  } catch {
    // Un JSON mal formado no deberia enmascarar el status real de la respuesta.
    return undefined;
  }
}

function send(
  method: "GET" | "POST",
  path: string,
  body: unknown,
  options?: RequestOptions,
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (accessToken !== null) headers.Authorization = `Bearer ${accessToken}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  return fetch(buildUrl(path, options?.params), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: options?.signal,
  });
}

async function request<T>(
  method: "GET" | "POST",
  path: string,
  body: unknown,
  options?: RequestOptions,
): Promise<T> {
  let response = await send(method, path, body, options);

  if (response.status === 401 && !NO_REFRESH_PATHS.includes(path)) {
    const renewed = await refreshAccessToken();

    if (renewed === null) {
      // No hay forma de recuperar la sesion: se propaga el error Y se fuerza
      // el logout, para que la UI no quede mostrando datos de una sesion
      // que ya no existe.
      forceLogout();
      throw new ApiError(401, await parseBody(response), "Sesion expirada");
    }

    // Un unico reintento. Si vuelve a dar 401 con un token recien emitido, el
    // problema no es la expiracion (falta de permisos, token revocado), y
    // reintentar en bucle solo esconderia el error.
    response = await send(method, path, body, options);

    if (response.status === 401) {
      forceLogout();
      throw new ApiError(401, await parseBody(response), "Sesion expirada");
    }
  }

  const parsed = await parseBody(response);
  if (!response.ok) throw new ApiError(response.status, parsed);

  return parsed as T;
}

export const httpClient = {
  get: <T = unknown>(path: string, options?: RequestOptions): Promise<T> =>
    request<T>("GET", path, undefined, options),

  post: <T = unknown>(path: string, body: unknown, options?: RequestOptions): Promise<T> =>
    request<T>("POST", path, body, options),
};
