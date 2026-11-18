import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeWebSocket } from "@/services/websocket/testing/FakeWebSocket";
import type { ReactorState } from "@/types/reactor";

const STOPPED: ReactorState = {
  sermo: false,
  status: "DETENIDO",
  updated_at: "2026-11-18T12:00:00Z",
  operation_id: null,
  source_connected: true,
};
const OPERATING: ReactorState = {
  sermo: true,
  status: "OPERACION",
  updated_at: "2026-11-18T12:05:00Z",
  operation_id: "OP-2026-001",
  source_connected: true,
};

// La conexion compartida vive en variables de modulo: cada test carga los
// modulos de cero para no heredar la conexion del anterior.
async function load() {
  vi.resetModules();
  const getReactorState = vi.fn<() => Promise<ReactorState>>(() => new Promise(() => {}));
  vi.doMock("../services/realtimeApi", () => ({ realtimeApi: { getReactorState } }));

  const http = await import("@/services/api/httpClient");
  const hook = await import("./useReactorState");
  const { reactorStateStore } = await import("@/store/reactorStateStore");
  return { ...http, ...hook, store: reactorStateStore, getReactorState };
}

describe("retainReactorState", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeWebSocket);
    FakeWebSocket.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.doUnmock("../services/realtimeApi");
  });

  it("pide el estado inicial por REST y lo actualiza en vivo por WebSocket", async () => {
    const m = await load();
    m.getReactorState.mockResolvedValue(STOPPED);
    m.setSessionTokens({ accessToken: "token", refreshToken: "refresh" });

    m.retainReactorState();
    await vi.advanceTimersByTimeAsync(0);
    expect(m.store.getSnapshot().view).toBe("stopped");

    const ws = FakeWebSocket.last();
    ws.serverOpen();
    ws.serverSend({ type: "state_changed", data: OPERATING });
    expect(m.store.getSnapshot()).toMatchObject({ view: "operating", sermo: true });
    expect(m.store.getSnapshot().state?.operation_id).toBe("OP-2026-001");
  });

  it("perder la conexion no se muestra como detenido, y reconecta solo", async () => {
    const m = await load();
    m.setSessionTokens({ accessToken: "token", refreshToken: "refresh" });
    m.retainReactorState();
    FakeWebSocket.last().serverOpen();
    FakeWebSocket.last().serverSend({ type: "state_changed", data: OPERATING });

    FakeWebSocket.last().serverClose(1006);
    expect(m.store.getSnapshot()).toMatchObject({ view: "disconnected", sermo: null });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(FakeWebSocket.instances).toHaveLength(2);
    FakeWebSocket.last().serverOpen();
    FakeWebSocket.last().serverSend({ type: "state_changed", data: STOPPED });
    expect(m.store.getSnapshot().view).toBe("stopped");
  });

  it("comparte una sola conexion entre todos los que lo usan", async () => {
    const m = await load();
    m.setSessionTokens({ accessToken: "token", refreshToken: "refresh" });

    const releaseA = m.retainReactorState();
    const releaseB = m.retainReactorState();
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(m.getReactorState).toHaveBeenCalledOnce();

    releaseA();
    vi.advanceTimersByTime(m.RELEASE_DELAY_MS);
    expect(FakeWebSocket.last().closedByClientWith).toBeNull();
    releaseB();
  });

  it("cierra el socket cuando se desmonta el ultimo componente", async () => {
    const m = await load();
    m.setSessionTokens({ accessToken: "token", refreshToken: "refresh" });
    const release = m.retainReactorState();
    const ws = FakeWebSocket.last();
    ws.serverOpen();

    release();
    vi.advanceTimersByTime(m.RELEASE_DELAY_MS - 1);
    expect(ws.closedByClientWith).toBeNull();
    vi.advanceTimersByTime(1);
    expect(ws.closedByClientWith).toBe(1000);
    expect(m.store.getSnapshot().state).toBeNull();
  });

  it("no cierra si otro componente lo toma durante la espera (navegacion)", async () => {
    const m = await load();
    m.setSessionTokens({ accessToken: "token", refreshToken: "refresh" });
    m.retainReactorState()();
    m.retainReactorState();

    vi.advanceTimersByTime(m.RELEASE_DELAY_MS * 2);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.last().closedByClientWith).toBeNull();
  });

  it("cierra el socket y olvida el estado al hacer logout", async () => {
    const m = await load();
    m.setSessionTokens({ accessToken: "token", refreshToken: "refresh" });
    m.retainReactorState();
    const ws = FakeWebSocket.last();
    ws.serverOpen();
    ws.serverSend({ type: "state_changed", data: OPERATING });

    m.setSessionTokens(null);
    expect(ws.closedByClientWith).toBe(1000);
    expect(m.store.getSnapshot().state).toBeNull();
    expect(m.store.getSnapshot().sermo).toBeNull();

    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("sin sesion no conecta, y conecta al iniciarla", async () => {
    const m = await load();
    m.retainReactorState();
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(m.getReactorState).not.toHaveBeenCalled();

    m.setSessionTokens({ accessToken: "token", refreshToken: "refresh" });
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(m.getReactorState).toHaveBeenCalledOnce();
  });

  it("descarta un GET que responde despues del primer evento del WebSocket", async () => {
    const m = await load();
    let resolveGet!: (state: ReactorState) => void;
    m.getReactorState.mockReturnValue(new Promise((resolve) => (resolveGet = resolve)));
    m.setSessionTokens({ accessToken: "token", refreshToken: "refresh" });
    m.retainReactorState();

    FakeWebSocket.last().serverOpen();
    FakeWebSocket.last().serverSend({ type: "state_changed", data: OPERATING });
    resolveGet(STOPPED);
    await vi.advanceTimersByTimeAsync(0);

    expect(m.store.getSnapshot().view).toBe("operating");
  });
});
