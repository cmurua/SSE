// Si los datos en vivo estan al dia (tarea 3.7): lo que muestra la celda
// "Datos" de la franja de la operacion. Solo tiene sentido con el WebSocket,
// por eso queda en realtime y no en operation-viewer.
import type { WsStatus } from "@/services/websocket/wsClient";

/** Sin muestras por mas de esto, los datos se marcan desactualizados: tres
 *  periodos de muestreo (1 Hz) mas el margen de latencia del RNF01 (2 s). */
export const STALE_AFTER_MS = 5_000;

/**
 * Si lo que se ve esta al dia:
 * - `connecting`: no hay conexion (primer intento o reintento).
 * - `idle`: no hay variables elegidas, asi que no llegan muestras y no hay
 *   nada que medir.
 * - `waiting`: conectado y con variables, sin ninguna muestra todavia.
 * - `stale`: paso mas de STALE_AFTER_MS desde la ultima muestra.
 * - `live`: al dia.
 *
 * Se mide con `receivedAt` (reloj del navegador) y no con el timestamp de la
 * muestra: un reloj del servidor desfasado daria falsas alarmas.
 */
export type DataFreshness = "connecting" | "idle" | "waiting" | "stale" | "live";

export function dataFreshness({
  connection,
  hasSelection,
  receivedAt,
  now,
}: {
  connection: WsStatus;
  hasSelection: boolean;
  receivedAt: number | null;
  now: number;
}): DataFreshness {
  if (connection !== "open") return "connecting";
  if (!hasSelection) return "idle";
  if (receivedAt === null) return "waiting";
  return now - receivedAt > STALE_AFTER_MS ? "stale" : "live";
}
