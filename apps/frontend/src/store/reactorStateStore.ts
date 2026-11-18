// Estado global minimo de SERMO/estado del reactor, para que cualquier
// pantalla (no solo Realtime) pueda saber si el reactor esta OPERANDO.
// Puerto del estado `sermo` que en el prototipo vivia en App.jsx.
//
// Es un modulo plano y no un Context, por lo mismo que httpClient: lo
// alimenta la conexion de features/realtime/hooks/useReactorState.ts, que no
// es un componente. React lo lee con useSyncExternalStore, que re-renderiza
// solo a los componentes suscriptos y no a todo el arbol.
//
// Este archivo solo guarda y deriva; abrir la conexion es tarea del hook.
import { useSyncExternalStore } from "react";
import type { WsStatus } from "@/services/websocket/wsClient";
import type { ReactorState } from "@/types/reactor";

/**
 * Como se muestra el reactor:
 * - `loading`: todavia no llego ningun estado.
 * - `operating` / `stopped`: lo que dice SERMO, con conexion y senal vigentes.
 * - `disconnected`: no se sabe si el reactor opera. Se perdio el WebSocket, o
 *   el backend dejo de recibir la senal (`source_connected: false`). Nunca se
 *   muestra como `stopped`: el reactor puede estar operando igual.
 */
export type ReactorView = "loading" | "operating" | "stopped" | "disconnected";

export interface ReactorStateSnapshot {
  /** Ultimo estado recibido. Puede estar desactualizado: ver `view`. */
  state: ReactorState | null;
  connection: WsStatus;
  /** SERMO solo si se sabe; null mientras `view` no sea operating/stopped. */
  sermo: boolean | null;
  view: ReactorView;
}

function deriveView(
  state: ReactorState | null,
  connection: WsStatus,
  stale: boolean,
): ReactorView {
  // "connecting" cuenta como vigente: es el primer intento y el estado, si
  // ya esta, es el del GET inicial, recien pedido. "reconnecting" no: hubo un
  // corte y el ultimo valor pudo haber cambiado sin que nos enteremos.
  const live = connection === "open" || connection === "connecting";
  if (state === null) return live ? "loading" : "disconnected";
  if (!live || stale || !state.source_connected) return "disconnected";
  return state.sermo ? "operating" : "stopped";
}

function buildSnapshot(
  state: ReactorState | null,
  connection: WsStatus,
  stale: boolean,
): ReactorStateSnapshot {
  const view = deriveView(state, connection, stale);
  const sermo = view === "operating" ? true : view === "stopped" ? false : null;
  return { state, connection, sermo, view };
}

const INITIAL_SNAPSHOT = buildSnapshot(null, "closed", false);

let snapshot = INITIAL_SNAPSHOT;
// Si ya llego un estado por WebSocket desde el ultimo reset.
let hasLiveState = false;
// Si el estado guardado es de antes de un corte. Hace falta ademas de mirar
// `connection`: al reconectar, la conexion queda "open" un instante antes de
// que llegue el primer mensaje, y en ese instante el estado guardado todavia
// es el viejo (p. ej. una operacion que termino durante el corte).
let stale = false;
const listeners = new Set<() => void>();

function update(state: ReactorState | null, connection: WsStatus): void {
  const next = buildSnapshot(state, connection, stale);
  if (
    next.state === snapshot.state &&
    next.connection === snapshot.connection &&
    next.view === snapshot.view
  ) {
    return;
  }
  snapshot = next;
  for (const listener of listeners) listener();
}

export const reactorStateStore = {
  getSnapshot(): ReactorStateSnapshot {
    return snapshot;
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** Valor del GET inicial. Se descarta si el WebSocket ya entrego uno: la
   *  respuesta REST pudo haber salido antes de un cambio que el WS ya aviso,
   *  y aplicarla volveria a un estado viejo. No alcanza con comparar
   *  `updated_at`, porque un cambio de `source_connected` no lo mueve.
   *  Tambien si ya hubo un corte: se mostraria como vigente hasta el primer
   *  mensaje de la reconexion, sin que nada avise los cambios del medio. */
  setInitialState(state: ReactorState): void {
    if (hasLiveState || stale) return;
    update(state, snapshot.connection);
  },

  /** Estado de un evento `state_changed`. Trae el estado completo, asi que
   *  reemplaza al anterior. */
  setLiveState(state: ReactorState): void {
    hasLiveState = true;
    stale = false;
    update(state, snapshot.connection);
  },

  setConnection(connection: WsStatus): void {
    if (connection === "reconnecting" || connection === "closed") stale = true;
    update(snapshot.state, connection);
  },

  /** Vuelve al estado inicial, p. ej. al cerrar sesion. */
  reset(): void {
    hasLiveState = false;
    stale = false;
    if (snapshot === INITIAL_SNAPSHOT) return;
    snapshot = INITIAL_SNAPSHOT;
    for (const listener of listeners) listener();
  },
};

export function useReactorStateStore(): ReactorStateSnapshot {
  return useSyncExternalStore(reactorStateStore.subscribe, reactorStateStore.getSnapshot);
}
