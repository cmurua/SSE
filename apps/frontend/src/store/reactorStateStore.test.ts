import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactorState } from "@/types/reactor";
import { reactorStateStore } from "./reactorStateStore";

function reactorState(overrides: Partial<ReactorState> = {}): ReactorState {
  const sermo = overrides.sermo ?? false;
  return {
    sermo,
    status: sermo ? "OPERACION" : "DETENIDO",
    updated_at: "2026-11-18T12:00:00Z",
    operation_id: sermo ? "OP-2026-001" : null,
    source_connected: true,
    ...overrides,
  };
}

describe("reactorStateStore", () => {
  beforeEach(() => reactorStateStore.reset());

  it("arranca sin estado y desconectado", () => {
    const snapshot = reactorStateStore.getSnapshot();
    expect(snapshot.state).toBeNull();
    expect(snapshot.sermo).toBeNull();
    expect(snapshot.view).toBe("disconnected");
  });

  it("esta cargando mientras conecta y no hay estado", () => {
    reactorStateStore.setConnection("connecting");
    expect(reactorStateStore.getSnapshot().view).toBe("loading");
  });

  it("muestra lo que dice SERMO con la conexion abierta", () => {
    reactorStateStore.setConnection("open");
    reactorStateStore.setLiveState(reactorState({ sermo: true }));
    expect(reactorStateStore.getSnapshot()).toMatchObject({ sermo: true, view: "operating" });

    reactorStateStore.setLiveState(reactorState({ sermo: false }));
    expect(reactorStateStore.getSnapshot()).toMatchObject({ sermo: false, view: "stopped" });
  });

  it("perder la conexion es 'desconectado', no 'detenido', y conserva el ultimo estado", () => {
    reactorStateStore.setConnection("open");
    reactorStateStore.setLiveState(reactorState({ sermo: true }));

    reactorStateStore.setConnection("reconnecting");
    const snapshot = reactorStateStore.getSnapshot();
    expect(snapshot.view).toBe("disconnected");
    expect(snapshot.sermo).toBeNull();
    expect(snapshot.state?.sermo).toBe(true);

    // Reconectado pero sin mensaje todavia: el estado guardado es de antes
    // del corte y no se puede dar por bueno.
    reactorStateStore.setConnection("open");
    expect(reactorStateStore.getSnapshot()).toMatchObject({ sermo: null, view: "disconnected" });

    // El primer mensaje del servidor lo pone al dia.
    reactorStateStore.setLiveState(reactorState({ sermo: false }));
    expect(reactorStateStore.getSnapshot().view).toBe("stopped");
  });

  it("sin senal en el backend es 'desconectado' aunque el WebSocket este abierto", () => {
    reactorStateStore.setConnection("open");
    reactorStateStore.setLiveState(reactorState({ sermo: false, source_connected: false }));
    expect(reactorStateStore.getSnapshot()).toMatchObject({ sermo: null, view: "disconnected" });
  });

  it("usa el GET inicial mientras el WebSocket conecta", () => {
    reactorStateStore.setConnection("connecting");
    reactorStateStore.setInitialState(reactorState({ sermo: true }));
    expect(reactorStateStore.getSnapshot().view).toBe("operating");
  });

  it("descarta el GET inicial si el WebSocket ya entrego un estado", () => {
    reactorStateStore.setConnection("open");
    reactorStateStore.setLiveState(reactorState({ sermo: false }));
    reactorStateStore.setInitialState(reactorState({ sermo: true }));
    expect(reactorStateStore.getSnapshot().view).toBe("stopped");
  });

  it("descarta el GET inicial si llega despues de un corte", () => {
    reactorStateStore.setConnection("connecting");
    reactorStateStore.setConnection("reconnecting");
    reactorStateStore.setInitialState(reactorState({ sermo: true }));

    // Reconectado, todavia sin mensaje: no hay estado vigente que mostrar.
    reactorStateStore.setConnection("open");
    expect(reactorStateStore.getSnapshot()).toMatchObject({ state: null, view: "loading" });
  });

  it("avisa a los suscriptos solo cuando algo cambia", () => {
    const listener = vi.fn();
    const unsubscribe = reactorStateStore.subscribe(listener);

    reactorStateStore.setConnection("open");
    reactorStateStore.setConnection("open");
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    reactorStateStore.setConnection("reconnecting");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("reset() vuelve al estado inicial y vuelve a aceptar el GET", () => {
    reactorStateStore.setConnection("open");
    reactorStateStore.setLiveState(reactorState({ sermo: true }));
    reactorStateStore.reset();
    expect(reactorStateStore.getSnapshot().state).toBeNull();

    reactorStateStore.setConnection("connecting");
    reactorStateStore.setInitialState(reactorState({ sermo: true }));
    expect(reactorStateStore.getSnapshot().view).toBe("operating");
  });
});
