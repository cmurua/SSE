// Suscribe al topico reactor.state (WS) + fallback GET /reactor-state (REST)
// para el valor inicial. Fuente unica de la bandera SERMO en el frontend.
//
// Hay UNA sola conexion para toda la app, sin importar cuantos componentes
// usen el hook: el header y la pantalla de tiempo real leen el mismo store
// (store/reactorStateStore.ts). La conexion se abre con el primer componente
// que lo usa y se cierra cuando se desmonta el ultimo, o al cerrar sesion.
import { useEffect } from "react";
import { getAccessToken, subscribeToSession } from "@/services/api/httpClient";
import { WS_EVENT_TYPES, WS_TOPICS } from "@/services/websocket/topics";
import { createWsClient, type WsClient } from "@/services/websocket/wsClient";
import {
  reactorStateStore,
  useReactorStateStore,
  type ReactorStateSnapshot,
} from "@/store/reactorStateStore";
import type { ReactorState } from "@/types/reactor";
import { realtimeApi } from "../services/realtimeApi";

// Cuanto se espera, despues de que se desmonta el ultimo componente, antes de
// cerrar. Al navegar, la pantalla que se va se desmonta antes de que monte la
// que llega; sin esta espera, pasar entre dos pantallas que usan el hook
// cerraria y reabriria el socket. Tambien absorbe el doble montaje de
// StrictMode en desarrollo.
export const RELEASE_DELAY_MS = 1_000;

let users = 0;
let client: WsClient | null = null;
let initialRequest: AbortController | null = null;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;
let unsubscribeSession: (() => void) | null = null;

function connect(): void {
  // Sin sesion no hay a que conectarse: el WS rechazaria con 1008 y el GET
  // con 401. Se conecta cuando se inicie sesion (ver onSessionChange).
  if (client !== null || getAccessToken() === null) return;

  client = createWsClient(WS_TOPICS.REACTOR_STATE, {
    onEvent: (event) => {
      if (event.type === WS_EVENT_TYPES.STATE_CHANGED) {
        reactorStateStore.setLiveState(event.data as ReactorState);
      }
    },
    onStatusChange: (status) => reactorStateStore.setConnection(status),
  });
  client.connect();

  // El primer mensaje del WS ya trae el estado; el GET va en paralelo para
  // tener el valor aunque el WS tarde o no logre conectar. Si llega tarde, el
  // store lo descarta. Un fallo se ignora: el WS lo cubre, y si la sesion
  // vencio httpClient ya fuerza el logout.
  const controller = new AbortController();
  initialRequest = controller;
  realtimeApi
    .getReactorState({ signal: controller.signal })
    .then((state) => {
      if (!controller.signal.aborted) reactorStateStore.setInitialState(state);
    })
    .catch(() => {});
}

function disconnect(): void {
  initialRequest?.abort();
  initialRequest = null;
  client?.close();
  client = null;
  reactorStateStore.reset();
}

function onSessionChange(): void {
  // Cualquier cambio de sesion reabre de cero: al hacer logout no queda nada
  // abierto ni datos de la sesion anterior, y si se inicia otra, la conexion
  // usa el token nuevo.
  disconnect();
  connect();
}

/** Registra un usuario de la conexion compartida y devuelve la funcion para
 *  soltarlo. Separado del hook para poder probarlo sin montar componentes. */
export function retainReactorState(): () => void {
  users += 1;
  if (releaseTimer !== null) {
    clearTimeout(releaseTimer);
    releaseTimer = null;
  }
  if (unsubscribeSession === null) {
    unsubscribeSession = subscribeToSession(onSessionChange);
    connect();
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    users -= 1;
    if (users > 0) return;

    releaseTimer = setTimeout(() => {
      releaseTimer = null;
      unsubscribeSession?.();
      unsubscribeSession = null;
      disconnect();
    }, RELEASE_DELAY_MS);
  };
}

/**
 * Estado del reactor, actualizado en vivo.
 *
 * Para decidir si el reactor opera, usar `sermo` (o `view`), nunca
 * `state.sermo`: `state` es el ultimo valor recibido y sigue ahi aunque se
 * haya perdido la conexion. `sermo` es null cuando no se sabe.
 */
export function useReactorState(): ReactorStateSnapshot {
  useEffect(() => retainReactorState(), []);
  return useReactorStateStore();
}
