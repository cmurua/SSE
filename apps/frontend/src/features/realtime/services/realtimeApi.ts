import { ENDPOINTS } from "@/services/api/endpoints";
import { httpClient, type RequestOptions } from "@/services/api/httpClient";
import { WS_CLIENT_MESSAGE_TYPES } from "@/services/websocket/topics";
import type { ReactorState, ReactorVariable } from "@/types/reactor";
import type { RealtimeError, RealtimeSample, RealtimeSubscription } from "@/types/realtime";

export const realtimeApi = {
  getStatus: () => httpClient.get("/realtime/status"),
  getReactorState: (options?: RequestOptions) =>
    httpClient.get<ReactorState>(ENDPOINTS.reactorState, options),
  getVariables: (options?: RequestOptions) =>
    httpClient.get<ReactorVariable[]>(ENDPOINTS.reactorVariables, options),
};

// --- realtime.samples -----------------------------------------------------
// wsClient entrega `data` sin tipar. Estas funciones lo validan antes de
// usarlo: un mensaje con otra forma se descarta (devuelven null) en vez de
// romper la pantalla.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** Mensaje `subscribe`: la seleccion COMPLETA, no un agregado. `[]` deja de
 *  recibir muestras sin cortar la conexion. */
export function buildSubscribeMessage(variables: readonly string[]) {
  return { type: WS_CLIENT_MESSAGE_TYPES.SUBSCRIBE, variables: [...variables] };
}

export function parseSample(data: unknown): RealtimeSample | null {
  if (!isRecord(data)) return null;
  const { operation_id, timestamp, values } = data;
  if (typeof operation_id !== "string" || typeof timestamp !== "string" || !isRecord(values)) {
    return null;
  }
  for (const value of Object.values(values)) {
    if (value !== null && typeof value !== "number") return null;
  }
  return { operation_id, timestamp, values: values as RealtimeSample["values"] };
}

export function parseSubscription(data: unknown): RealtimeSubscription | null {
  if (!isRecord(data)) return null;
  const { operation_id, variables } = data;
  if (typeof operation_id !== "string" || !isStringArray(variables)) return null;
  // Opcional: un servidor anterior a la tarea 5.4 no lo manda, y eso no tiene
  // que dejar al grafico sin datos.
  const always = data.always_variables ?? [];
  if (!isStringArray(always)) return null;
  return { operation_id, variables, always_variables: always };
}

export function parseError(data: unknown): RealtimeError | null {
  if (!isRecord(data)) return null;
  const { code, message } = data;
  if (typeof code !== "string") return null;
  return { code, message: typeof message === "string" ? message : "" };
}
