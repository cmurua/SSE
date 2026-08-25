// Flujo de renovacion transparente del access token. Lo que se prueba no es
// "fetch funciona", sino que un token vencido se renueva sin que el llamador
// se entere: la promesa que devuelve httpClient resuelve con los datos, no
// rechaza.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  API_BASE_URL,
  ApiError,
  httpClient,
  getAccessToken,
  setOnAuthFailure,
  setSessionTokens,
} from "./httpClient";
import { ENDPOINTS } from "./endpoints";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Tipar el mock hace que `fetchMock.mock.calls` sea una tupla y no `any[]`:
// sin esto las aserciones sobre la URL y los headers no compilan con `tsc -b`.
const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();

/** Header Authorization con el que se llamo a fetch en la llamada `index`. */
function authHeaderOf(index: number): string | undefined {
  const init = fetchMock.mock.calls[index][1];
  return (init.headers as Record<string, string>).Authorization;
}

/** Cuerpo JSON con el que se llamo a fetch en la llamada `index`. */
function jsonBodyOf(index: number): unknown {
  return JSON.parse(fetchMock.mock.calls[index][1].body as string);
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  setSessionTokens({ accessToken: "token-vencido", refreshToken: "refresh-valido" });
  setOnAuthFailure(null);
});

afterEach(() => {
  setSessionTokens(null);
  setOnAuthFailure(null);
  vi.unstubAllGlobals();
});

describe("httpClient", () => {
  it("inyecta el access token en el header Authorization", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));

    await httpClient.get("/reactor-state");

    expect(authHeaderOf(0)).toBe("Bearer token-vencido");
  });

  it("arma la query string salteando los filtros vacios", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]));

    await httpClient.get(ENDPOINTS.historicals.operations, {
      params: { from: "2026-01-01", to: undefined, operationId: "" },
    });

    expect(fetchMock.mock.calls[0][0]).toBe(
      `${API_BASE_URL}${ENDPOINTS.historicals.operations}?from=2026-01-01`,
    );
  });

  it("ante un 401 refresca y reintenta la request original, de forma transparente", async () => {
    fetchMock
      // 1. La request original, con el token vencido.
      .mockResolvedValueOnce(jsonResponse({ detail: "token expirado" }, 401))
      // 2. El refresh.
      .mockResolvedValueOnce(jsonResponse({ access_token: "token-nuevo" }))
      // 3. El reintento.
      .mockResolvedValueOnce(jsonResponse({ operations: ["OP-2026-001"] }));

    const data = await httpClient.get<{ operations: string[] }>(
      ENDPOINTS.historicals.operations,
    );

    // El llamador recibe los datos: no percibio la renovacion.
    expect(data).toEqual({ operations: ["OP-2026-001"] });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // El refresh fue al endpoint correcto, con el refresh token.
    expect(fetchMock.mock.calls[1][0]).toBe(`${API_BASE_URL}${ENDPOINTS.auth.refresh}`);
    expect(jsonBodyOf(1)).toEqual({ refresh_token: "refresh-valido" });

    // El reintento usa el token NUEVO, no el vencido.
    expect(authHeaderOf(0)).toBe("Bearer token-vencido");
    expect(authHeaderOf(2)).toBe("Bearer token-nuevo");
    expect(getAccessToken()).toBe("token-nuevo");
  });

  it("guarda el refresh token rotado que devuelve el backend", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, 401))
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "token-nuevo", refresh_token: "refresh-rotado" }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      // Segundo ciclo, para ver con que refresh token se renueva.
      .mockResolvedValueOnce(jsonResponse({}, 401))
      .mockResolvedValueOnce(jsonResponse({ access_token: "token-3" }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    await httpClient.get("/reactor-state");
    await httpClient.get("/reactor-state");

    expect(jsonBodyOf(4)).toEqual({ refresh_token: "refresh-rotado" });
  });

  it("encola las requests concurrentes detras de un unico refresh", async () => {
    // Las cuatro requests fallan con 401 antes de que ninguna termine de
    // refrescar: sin single-flight se dispararian cuatro POST /auth/refresh.
    fetchMock.mockImplementation((url, init) => {
      if (url.endsWith(ENDPOINTS.auth.refresh)) {
        return Promise.resolve(jsonResponse({ access_token: "token-nuevo" }));
      }
      const header = (init.headers as Record<string, string>).Authorization;
      return Promise.resolve(
        header === "Bearer token-nuevo"
          ? jsonResponse({ ok: true })
          : jsonResponse({ detail: "expirado" }, 401),
      );
    });

    const results = await Promise.all([
      httpClient.get("/reactor-state"),
      httpClient.get("/realtime/status"),
      httpClient.get(ENDPOINTS.historicals.operations),
      httpClient.get(ENDPOINTS.helpSections),
    ]);

    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }, { ok: true }]);

    const refreshCalls = fetchMock.mock.calls.filter(([url]) =>
      url.endsWith(ENDPOINTS.auth.refresh),
    );
    expect(refreshCalls).toHaveLength(1);
  });

  it("si el refresh falla, propaga el error y fuerza el logout", async () => {
    const onAuthFailure = vi.fn();
    setOnAuthFailure(onAuthFailure);

    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, 401))
      .mockResolvedValueOnce(jsonResponse({ detail: "refresh invalido" }, 401));

    await expect(httpClient.get("/reactor-state")).rejects.toBeInstanceOf(ApiError);

    // No hubo reintento de la request original: 2 llamadas, no 3.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onAuthFailure).toHaveBeenCalledOnce();
    expect(getAccessToken()).toBeNull();
  });

  it("no reintenta mas de una vez: un 401 tras refrescar cierra la sesion", async () => {
    const onAuthFailure = vi.fn();
    setOnAuthFailure(onAuthFailure);

    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, 401))
      .mockResolvedValueOnce(jsonResponse({ access_token: "token-nuevo" }))
      // El reintento vuelve a dar 401: no es expiracion, es otra cosa.
      .mockResolvedValueOnce(jsonResponse({ detail: "sin permisos" }, 401));

    await expect(httpClient.get("/reactor-state")).rejects.toBeInstanceOf(ApiError);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(onAuthFailure).toHaveBeenCalledOnce();
  });

  it("no intenta refrescar ante un 401 de login", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: "credenciales invalidas" }, 401));

    await expect(
      httpClient.post(ENDPOINTS.auth.login, { username: "a", password: "b" }),
    ).rejects.toBeInstanceOf(ApiError);

    // Una sola llamada: un login rechazado no es una sesion vencida.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("propaga los errores que no son 401 sin tocar la sesion", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: "no existe" }, 404));

    await expect(httpClient.get("/historicals/operations/OP-9999")).rejects.toMatchObject({
      status: 404,
      body: { detail: "no existe" },
    });
    expect(getAccessToken()).toBe("token-vencido");
  });
});
