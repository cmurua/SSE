import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setSessionTokens } from "@/services/api/httpClient";
import { FakeWebSocket } from "@/services/websocket/testing/FakeWebSocket";
import { createRealtimeSession, type FlushScheduler } from "./useRealtimeSocket";

const T0 = Date.parse("2026-11-18T12:00:00Z");

function sampleEvent(second: number, values: Record<string, number | null>, operation_id = "OP-1") {
  return {
    type: "sample",
    data: { operation_id, timestamp: new Date(T0 + second * 1000).toISOString(), values },
  };
}

function subscribedEvent(variables: string[], operation_id = "OP-1") {
  return { type: "subscribed", data: { operation_id, variables } };
}

function sentMessages(ws: FakeWebSocket): unknown[] {
  return ws.sent.map((raw) => JSON.parse(raw));
}

// Flush manual: el test decide cuando "pasa el frame".
function manualScheduler() {
  let pending: (() => void) | null = null;
  const schedule: FlushScheduler = (flush) => {
    pending = flush;
    return () => (pending = null);
  };
  return {
    schedule,
    get pending() {
      return pending !== null;
    },
    frame() {
      const flush = pending;
      pending = null;
      flush?.();
    },
  };
}

function setup() {
  const scheduler = manualScheduler();
  const session = createRealtimeSession({ schedule: scheduler.schedule, now: () => 42 });
  const renders = vi.fn();
  session.subscribe(renders);
  return { session, scheduler, renders };
}

describe("createRealtimeSession", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    vi.stubGlobal("WebSocket", FakeWebSocket);
    FakeWebSocket.reset();
    setSessionTokens({ accessToken: "token", refreshToken: "refresh" });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    setSessionTokens(null);
  });

  it("se conecta a realtime.samples y pide la seleccion al abrir", () => {
    const { session, scheduler } = setup();
    session.setVariables(["A", "B"]);
    session.start();

    const ws = FakeWebSocket.last();
    expect(new URL(ws.url).pathname.endsWith("/realtime/ws")).toBe(true);
    expect(ws.sent).toHaveLength(0);

    ws.serverOpen();
    expect(sentMessages(ws)).toEqual([{ type: "subscribe", variables: ["A", "B"] }]);
    scheduler.frame();
    expect(session.getSnapshot().connection).toBe("open");
  });

  it("acumula las muestras en series por variable", () => {
    const { session, scheduler } = setup();
    session.setVariables(["A"]);
    session.start();
    const ws = FakeWebSocket.last();
    ws.serverOpen();
    ws.serverSend(subscribedEvent(["A"]));
    ws.serverSend(sampleEvent(0, { A: 1 }));
    ws.serverSend(sampleEvent(1, { A: 2 }));
    scheduler.frame();

    expect(session.getSnapshot()).toMatchObject({
      operationId: "OP-1",
      confirmed: ["A"],
      series: { A: [{ t: T0, v: 1 }, { t: T0 + 1000, v: 2 }] },
      lastSampleAt: T0 + 1000,
      receivedAt: 42,
    });
  });

  it("agrupa varias muestras en un solo aviso por frame", () => {
    const { session, scheduler, renders } = setup();
    session.setVariables(["A"]);
    session.start();
    const ws = FakeWebSocket.last();
    ws.serverOpen();
    scheduler.frame();
    renders.mockClear();

    for (let i = 0; i < 5; i++) ws.serverSend(sampleEvent(i, { A: i }));
    expect(renders).not.toHaveBeenCalled();
    scheduler.frame();
    expect(renders).toHaveBeenCalledOnce();
    expect(session.getSnapshot().series.A).toHaveLength(5);
  });

  it("el snapshot no cambia de referencia entre avisos", () => {
    const { session, scheduler } = setup();
    session.start();
    scheduler.frame();
    expect(session.getSnapshot()).toBe(session.getSnapshot());
  });

  it("cambiar la seleccion no reconecta: manda subscribe por el mismo socket", () => {
    const { session, scheduler } = setup();
    session.setVariables(["A", "B"]);
    session.start();
    const ws = FakeWebSocket.last();
    ws.serverOpen();
    ws.serverSend(sampleEvent(0, { A: 1, B: 2 }));

    session.setVariables(["B", "C"]);
    scheduler.frame();

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(ws.closedByClientWith).toBeNull();
    expect(sentMessages(ws).at(-1)).toEqual({ type: "subscribe", variables: ["B", "C"] });
    // B sigue elegida y conserva su serie; A se quita.
    expect(Object.keys(session.getSnapshot().series)).toEqual(["B"]);
  });

  it("no reenvia una seleccion igual a la vigente", () => {
    const { session } = setup();
    session.setVariables(["A"]);
    session.start();
    const ws = FakeWebSocket.last();
    ws.serverOpen();
    session.setVariables(["A"]);
    expect(ws.sent).toHaveLength(1);
  });

  it("tras un corte reconecta, vuelve a pedir la seleccion y conserva el buffer", async () => {
    const { session, scheduler } = setup();
    session.setVariables(["A"]);
    session.start();
    const first = FakeWebSocket.last();
    first.serverOpen();
    first.serverSend(subscribedEvent(["A"]));
    first.serverSend(sampleEvent(0, { A: 1 }));

    first.serverClose(1006);
    await vi.advanceTimersByTimeAsync(1_000);
    const second = FakeWebSocket.last();
    expect(second).not.toBe(first);
    second.serverOpen();
    expect(sentMessages(second)).toEqual([{ type: "subscribe", variables: ["A"] }]);

    second.serverSend(subscribedEvent([]));
    second.serverSend(sampleEvent(10, { A: 2 }));
    scheduler.frame();
    expect(session.getSnapshot().series.A.map((p) => p.v)).toEqual([1, 2]);
  });

  it("descarta el buffer si el servidor informa otra operacion", () => {
    const { session, scheduler } = setup();
    session.setVariables(["A"]);
    session.start();
    const ws = FakeWebSocket.last();
    ws.serverOpen();
    ws.serverSend(subscribedEvent(["A"]));
    ws.serverSend(sampleEvent(0, { A: 1 }));

    ws.serverSend(subscribedEvent(["A"], "OP-2"));
    scheduler.frame();
    expect(session.getSnapshot()).toMatchObject({ operationId: "OP-2", series: {} });
  });

  it("expone un subscribe rechazado y lo limpia con la siguiente confirmacion", () => {
    const { session, scheduler } = setup();
    session.start();
    const ws = FakeWebSocket.last();
    ws.serverOpen();

    ws.serverSend({ type: "error", data: { code: "unknown_variable", message: "X" } });
    scheduler.frame();
    expect(session.getSnapshot().error).toEqual({ code: "unknown_variable", message: "X" });

    ws.serverSend(subscribedEvent(["A"]));
    scheduler.frame();
    expect(session.getSnapshot().error).toBeNull();
  });

  it("al terminar la operacion (4409) queda cerrada, sin reintentar", async () => {
    const { session, scheduler } = setup();
    session.start();
    FakeWebSocket.last().serverOpen();
    FakeWebSocket.last().serverClose(4409);

    await vi.advanceTimersByTimeAsync(60_000);
    scheduler.frame();
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(session.getSnapshot().connection).toBe("closed");
  });

  it("descarta mensajes con otra forma sin avisar", () => {
    const { session, scheduler } = setup();
    session.setVariables(["A"]);
    session.start();
    const ws = FakeWebSocket.last();
    ws.serverOpen();
    scheduler.frame();

    ws.serverSend({ type: "sample", data: { operation_id: "OP-1", values: { A: 1 } } });
    ws.serverSend({ type: "sample", data: { ...sampleEvent(0, {}).data, values: { A: "1" } } });
    ws.serverSend({ type: "subscribed", data: { operation_id: "OP-1" } });
    expect(scheduler.pending).toBe(false);
  });

  it("dispose cierra el socket y no vuelve a avisar", () => {
    const { session, scheduler, renders } = setup();
    session.setVariables(["A"]);
    session.start();
    const ws = FakeWebSocket.last();
    ws.serverOpen();
    ws.serverSend(sampleEvent(0, { A: 1 }));

    session.dispose();
    expect(ws.closedByClientWith).toBe(1000);
    scheduler.frame();
    expect(renders).not.toHaveBeenCalled();
  });
});
