// Suscribe al topico realtime.samples y mantiene en memoria la ventana de
// datos que necesita el grafico. Solo debe usarse cuando
// useReactorState().sermo === true (RF04); si no, RealtimePage ya muestra
// "no disponible" (con el enlace a historicos) o "sin conexion".
//
// A diferencia de useReactorState, que comparte una conexion entre toda la
// app, esta conexion es de la pantalla que la usa: se abre al montarla y se
// cierra al salir.
//
// Toda la logica esta en createRealtimeSession, un objeto sin React, para
// poder probarla sin montar componentes. El hook solo la ata al ciclo de vida
// del componente.
import { useEffect, useState, useSyncExternalStore } from "react";
import { WS_EVENT_TYPES, WS_TOPICS } from "@/services/websocket/topics";
import { createWsClient, type WsStatus } from "@/services/websocket/wsClient";
import type { ChartPoint } from "@/components/charts/types";
import type { RealtimeError } from "@/types/realtime";
import {
  appendSample,
  EMPTY_BUFFER,
  forOperation,
  retainVariables,
  type RealtimeBuffer,
} from "../services/realtimeBuffer";
import {
  buildSubscribeMessage,
  parseError,
  parseSample,
  parseSubscription,
} from "../services/realtimeApi";

export interface RealtimeSnapshot {
  connection: WsStatus;
  /** Operacion que informo el servidor. null hasta el primer `subscribed`. */
  operationId: string | null;
  /** Seleccion que el servidor confirmo. Puede ir un instante detras de la
   *  pedida, o quedar en la anterior si el pedido fue rechazado (`error`). */
  confirmed: string[];
  /** Ultimos REALTIME_WINDOW_POINTS puntos de cada variable elegida, ordenados
   *  por tiempo. Forma de ChartRendererProps.data. */
  series: Record<string, ChartPoint[]>;
  /** `timestamp` de la ultima muestra (epoch ms, reloj del servidor). */
  lastSampleAt: number | null;
  /** Cuando llego la ultima muestra (epoch ms, reloj del navegador). Para
   *  detectar datos desactualizados sin depender del reloj del servidor. */
  receivedAt: number | null;
  /** Ultimo `subscribe` rechazado. Se limpia con la siguiente confirmacion. */
  error: RealtimeError | null;
}

export const IDLE_SNAPSHOT: RealtimeSnapshot = {
  connection: "closed",
  operationId: null,
  confirmed: [],
  series: {},
  lastSampleAt: null,
  receivedAt: null,
  error: null,
};

/** Agenda un aviso a React. Por defecto, una vez por frame. */
export type FlushScheduler = (flush: () => void) => () => void;

const frameScheduler: FlushScheduler = (flush) => {
  // Varias muestras entre dos frames se ven en un solo render, y con la
  // pestana en segundo plano (rAF pausado) no se renderiza nada hasta volver.
  if (typeof requestAnimationFrame === "function") {
    const id = requestAnimationFrame(flush);
    return () => cancelAnimationFrame(id);
  }
  const id = setTimeout(flush, 16);
  return () => clearTimeout(id);
};

export interface RealtimeSession {
  /** Abre la conexion. */
  start(): void;
  /** Cierra la conexion y deja de avisar. */
  dispose(): void;
  /** Reemplaza la seleccion (hasta 2 variables, RF05) sin reconectar. */
  setVariables(variables: readonly string[]): void;
  subscribe(listener: () => void): () => void;
  getSnapshot(): RealtimeSnapshot;
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, i) => item === b[i]);
}

export function createRealtimeSession(
  options: { schedule?: FlushScheduler; now?: () => number } = {},
): RealtimeSession {
  const schedule = options.schedule ?? frameScheduler;
  const now = options.now ?? Date.now;

  // Lo que se ira mostrando. Se actualiza en cada evento; el snapshot que lee
  // React se arma recien en el flush.
  let connection: WsStatus = "closed";
  let selection: string[] = [];
  let confirmed: string[] = [];
  let buffer: RealtimeBuffer = EMPTY_BUFFER;
  let receivedAt: number | null = null;
  let error: RealtimeError | null = null;

  let snapshot = IDLE_SNAPSHOT;
  let cancelFlush: (() => void) | null = null;
  let disposed = false;
  const listeners = new Set<() => void>();

  function flush(): void {
    cancelFlush = null;
    snapshot = {
      connection,
      operationId: buffer.operationId,
      confirmed,
      series: buffer.series,
      lastSampleAt: buffer.lastSampleAt,
      receivedAt,
      error,
    };
    for (const listener of listeners) listener();
  }

  function changed(): void {
    if (disposed || cancelFlush !== null) return;
    cancelFlush = schedule(flush);
  }

  function sendSelection(): void {
    client.send(buildSubscribeMessage(selection));
  }

  const client = createWsClient(WS_TOPICS.REALTIME_SAMPLES, {
    onEvent: (event) => {
      switch (event.type) {
        case WS_EVENT_TYPES.SAMPLE: {
          const sample = parseSample(event.data);
          if (sample === null) return;
          const next = appendSample(buffer, sample, selection);
          if (next === buffer) return;
          buffer = next;
          receivedAt = now();
          break;
        }
        case WS_EVENT_TYPES.SUBSCRIBED: {
          const subscription = parseSubscription(event.data);
          if (subscription === null) return;
          // El buffer se descarta solo si cambio la operacion: tras un corte
          // de red dentro de la misma operacion se conservan los datos, y el
          // grafico muestra el hueco (el eje X es el timestamp).
          buffer = forOperation(buffer, subscription.operation_id);
          confirmed = subscription.variables;
          error = null;
          break;
        }
        case WS_EVENT_TYPES.ERROR: {
          const rejected = parseError(event.data);
          if (rejected === null) return;
          error = rejected;
          break;
        }
        default:
          return;
      }
      changed();
    },
    onStatusChange: (status) => {
      connection = status;
      // Cada conexion nueva arranca sin variables en el servidor: hay que
      // volver a pedirlas, o tras un corte el grafico quedaria congelado.
      if (status === "open" && selection.length > 0) sendSelection();
      changed();
    },
  });

  return {
    start() {
      if (!disposed) client.connect();
    },

    dispose() {
      disposed = true;
      cancelFlush?.();
      cancelFlush = null;
      client.close();
      listeners.clear();
    },

    setVariables(variables) {
      if (disposed || sameList(variables, selection)) return;
      selection = [...variables];
      buffer = retainVariables(buffer, selection);
      // Si no esta abierta, la seleccion se manda al abrir (onStatusChange).
      if (client.status === "open") sendSelection();
      changed();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    getSnapshot() {
      return snapshot;
    },
  };
}

const noSubscribe = () => () => {};
const idleSnapshot = () => IDLE_SNAPSHOT;

export interface UseRealtimeSocketOptions {
  /** Operacion en curso segun useReactorState. null = no conectar. Al
   *  cambiar se abre una conexion nueva con el buffer vacio. */
  operationId: string | null;
  /** Variables elegidas, en orden (Variable A, Variable B). Cambiarlas no
   *  reconecta. */
  variables: readonly string[];
}

export function useRealtimeSocket({
  operationId,
  variables,
}: UseRealtimeSocketOptions): RealtimeSnapshot {
  const [current, setCurrent] = useState<{
    operationId: string;
    session: RealtimeSession;
  } | null>(null);

  // Una conexion por operacion: el servidor cierra con 4409 al terminar, y
  // la siguiente llega como otro operationId desde reactor.state.
  useEffect(() => {
    if (operationId === null) return;
    const session = createRealtimeSession();
    setCurrent({ operationId, session });
    session.start();
    return () => session.dispose();
  }, [operationId]);

  // La sesion guardada se usa solo si es de la operacion actual. Si no, en
  // el render en que cambia operationId (antes de que corra el efecto) se
  // mostraria la sesion anterior, ya cerrada, con los datos de otra operacion.
  const session = current?.operationId === operationId ? current.session : null;

  // setVariables ignora una lista igual a la vigente, asi que no importa que
  // `variables` sea un array nuevo en cada render.
  useEffect(() => {
    session?.setVariables(variables);
  }, [session, variables]);

  return useSyncExternalStore(
    session?.subscribe ?? noSubscribe,
    session?.getSnapshot ?? idleSnapshot,
  );
}
