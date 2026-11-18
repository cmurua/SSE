import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forceLogout, refreshAccessToken, setSessionTokens } from "@/services/api/httpClient";
import { FakeWebSocket } from "./testing/FakeWebSocket";
import { WS_CLOSE_CODES, WS_TOPICS } from "./topics";
import {
  backoffDelay,
  CONNECT_TIMEOUT_MS,
  createWsClient,
  type WsEvent,
  type WsStatus,
} from "./wsClient";

vi.mock("@/services/api/httpClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/api/httpClient")>()),
  refreshAccessToken: vi.fn(),
  forceLogout: vi.fn(),
}));

function setup() {
  const events: WsEvent[] = [];
  const statuses: WsStatus[] = [];
  const client = createWsClient(WS_TOPICS.REACTOR_STATE, {
    onEvent: (event) => events.push(event),
    onStatusChange: (status) => statuses.push(status),
  });
  return { client, events, statuses };
}

describe("createWsClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Sin azar: cada espera es la mitad fija del backoff (0.5 s, 1 s, 2 s...).
    vi.spyOn(Math, "random").mockReturnValue(0);
    vi.stubGlobal("WebSocket", FakeWebSocket);
    FakeWebSocket.reset();
    setSessionTokens({ accessToken: "token-1", refreshToken: "refresh-1" });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.mocked(refreshAccessToken).mockReset();
    vi.mocked(forceLogout).mockReset();
    setSessionTokens(null);
  });

  it("se conecta al endpoint del topico con el access token en la query", () => {
    const { client, statuses } = setup();
    client.connect();

    const url = new URL(FakeWebSocket.last().url);
    expect(url.pathname.endsWith("/reactor-state/ws")).toBe(true);
    expect(url.searchParams.get("access_token")).toBe("token-1");
    expect(statuses).toEqual(["connecting"]);

    FakeWebSocket.last().serverOpen();
    expect(client.status).toBe("open");
  });

  it("no intenta conectarse sin sesion", () => {
    setSessionTokens(null);
    const { client } = setup();
    client.connect();

    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(client.status).toBe("closed");
  });

  it("entrega los eventos parseados y descarta lo que no respeta el sobre", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { client, events } = setup();
    client.connect();
    const ws = FakeWebSocket.last();
    ws.serverOpen();

    ws.serverSend({ type: "state_changed", data: { sermo: true } });
    ws.serverSend("esto no es JSON");
    ws.serverSend({ data: { sermo: false } });
    ws.serverSend(null);

    expect(events).toEqual([{ type: "state_changed", data: { sermo: true } }]);
    expect(client.status).toBe("open");
  });

  it("reconecta con backoff creciente ante un corte, y lo reinicia al conectar", () => {
    const { client } = setup();
    client.connect();
    FakeWebSocket.last().serverOpen();

    // Backend reiniciando: el corte y los dos primeros reintentos fallan.
    FakeWebSocket.last().serverClose(1006);
    expect(client.status).toBe("reconnecting");
    vi.advanceTimersByTime(499);
    expect(FakeWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(2);

    FakeWebSocket.last().serverClose(1006);
    vi.advanceTimersByTime(999);
    expect(FakeWebSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(3);

    // Vuelve: el backoff arranca de nuevo desde el primer escalon.
    FakeWebSocket.last().serverOpen();
    expect(client.status).toBe("open");
    FakeWebSocket.last().serverClose(1013);
    vi.advanceTimersByTime(500);
    expect(FakeWebSocket.instances).toHaveLength(4);
  });

  it("no espera mas que el tope entre reintentos", () => {
    expect(backoffDelay(10)).toBe(15_000);
    vi.mocked(Math.random).mockReturnValue(1);
    expect(backoffDelay(10)).toBe(30_000);
  });

  it("abandona un intento que no se abre a tiempo y reintenta", () => {
    const { client } = setup();
    client.connect();
    const ws = FakeWebSocket.last();

    vi.advanceTimersByTime(CONNECT_TIMEOUT_MS);
    expect(ws.closedByClientWith).not.toBeNull();
    expect(client.status).toBe("reconnecting");
    vi.advanceTimersByTime(500);
    expect(FakeWebSocket.instances).toHaveLength(2);

    // El aviso tardio del intento abandonado no programa otro reintento.
    ws.serverClose(1006);
    vi.advanceTimersByTime(1_000);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it("un error antes de abrir cuenta como intento fallido, sin esperar al close", () => {
    const { client } = setup();
    client.connect();
    FakeWebSocket.last().networkError();

    expect(client.status).toBe("reconnecting");
    vi.advanceTimersByTime(500);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it("un error con la conexion abierta espera al close, que trae el codigo", () => {
    const { client } = setup();
    client.connect();
    const ws = FakeWebSocket.last();
    ws.serverOpen();

    ws.networkError();
    expect(client.status).toBe("open");
    ws.serverClose(WS_CLOSE_CODES.POLICY_VIOLATION);
    expect(forceLogout).toHaveBeenCalledOnce();
  });

  it("una conexion abierta no se abandona por el timeout de conexion", () => {
    const { client } = setup();
    client.connect();
    FakeWebSocket.last().serverOpen();

    vi.advanceTimersByTime(CONNECT_TIMEOUT_MS * 3);
    expect(client.status).toBe("open");
    expect(FakeWebSocket.last().closedByClientWith).toBeNull();
  });

  it("ante 1008 no reintenta y termina la sesion", () => {
    const { client } = setup();
    client.connect();
    FakeWebSocket.last().serverClose(WS_CLOSE_CODES.POLICY_VIOLATION);

    expect(client.status).toBe("closed");
    expect(forceLogout).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("ante 4409 no reintenta, pero se puede volver a conectar", () => {
    const { client } = setup();
    client.connect();
    FakeWebSocket.last().serverClose(WS_CLOSE_CODES.REACTOR_NOT_OPERATING);

    expect(client.status).toBe("closed");
    expect(forceLogout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);

    client.connect();
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it("ante 4401 renueva el token y reconecta con el nuevo", async () => {
    vi.mocked(refreshAccessToken).mockImplementation(async () => {
      setSessionTokens({ accessToken: "token-2", refreshToken: "refresh-2" });
      return "token-2";
    });
    const { client } = setup();
    client.connect();
    FakeWebSocket.last().serverOpen();

    FakeWebSocket.last().serverClose(WS_CLOSE_CODES.TOKEN_EXPIRED);
    expect(client.status).toBe("reconnecting");
    await vi.advanceTimersByTimeAsync(500);

    expect(refreshAccessToken).toHaveBeenCalledOnce();
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(new URL(FakeWebSocket.last().url).searchParams.get("access_token")).toBe("token-2");
  });

  it("ante 4401 sin poder renovar termina la sesion", async () => {
    vi.mocked(refreshAccessToken).mockResolvedValue(null);
    const { client } = setup();
    client.connect();
    FakeWebSocket.last().serverClose(WS_CLOSE_CODES.TOKEN_EXPIRED);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(client.status).toBe("closed");
    expect(forceLogout).toHaveBeenCalledOnce();
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("close() cierra el socket y cancela el reintento pendiente", () => {
    const { client } = setup();
    client.connect();
    const ws = FakeWebSocket.last();
    ws.serverOpen();
    ws.serverClose(1006);

    client.close();
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(client.status).toBe("closed");
  });

  it("close() con la conexion abierta no dispara una reconexion", () => {
    const { client, events } = setup();
    client.connect();
    const ws = FakeWebSocket.last();
    ws.serverOpen();

    client.close();
    expect(ws.closedByClientWith).toBe(1000);
    // El navegador avisa el cierre despues; ya no tiene que tener efecto.
    ws.serverSend({ type: "state_changed", data: {} });
    ws.serverClose(1000);
    vi.advanceTimersByTime(60_000);

    expect(events).toHaveLength(0);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("send() manda JSON solo con la conexion abierta", () => {
    const { client } = setup();
    client.connect();
    expect(client.send({ type: "subscribe", variables: [] })).toBe(false);

    FakeWebSocket.last().serverOpen();
    expect(client.send({ type: "subscribe", variables: ["LOGA1"] })).toBe(true);
    expect(FakeWebSocket.last().sent).toEqual(['{"type":"subscribe","variables":["LOGA1"]}']);
  });
});
