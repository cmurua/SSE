// Logica del panel de valor instantaneo y de la franja de la operacion
// (tarea 3.7): formato de valores y horas, ultimo valor de cada variable,
// estadisticas de la ventana y si los datos estan al dia. Funciones puras,
// separadas de los componentes para probarlas sin renderizar.
import type { ChartPoint } from "@/components/charts/types";
import type { WsStatus } from "@/services/websocket/wsClient";

/** Sin muestras por mas de esto, los datos se marcan desactualizados: tres
 *  periodos de muestreo (1 Hz) mas el margen de latencia del RNF01 (2 s). */
export const STALE_AFTER_MS = 5_000;

/**
 * Un valor medido, segun su magnitud: notacion cientifica por encima de 1e5
 * y por debajo de 1e-3 (1.03e5, 5e-4); si no, unas 4 cifras significativas
 * con decimales fijos por magnitud (1032, 482.1, 48.30, 5.007, 0.2500), para
 * que el numero no cambie de ancho mientras se actualiza.
 */
export function formatValue(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const magnitude = Math.abs(value);
  if (magnitude === 0) return "0";
  if (magnitude >= 1e5 || magnitude < 1e-3) {
    const [mantissa, exponent] = value.toExponential().split("e");
    return `${Number(Number(mantissa).toPrecision(3))}e${Number(exponent)}`;
  }
  const decimals =
    magnitude >= 1000 ? 0 : magnitude >= 100 ? 1 : magnitude >= 10 ? 2 : magnitude >= 1 ? 3 : 4;
  return value.toFixed(decimals);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Hora local del navegador, "14:03:27". */
export function formatTime(t: number): string {
  const date = new Date(t);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** "01:02:03". Las operaciones de mas de un dia siguen sumando horas. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

export interface LatestValue {
  value: number;
  t: number;
  /** false = la ultima muestra no trajo dato para esta variable (el canal
   *  publico null) y `value` es de una muestra anterior. */
  current: boolean;
}

/**
 * Ultimo valor de una serie. El buffer no guarda los `null`, asi que el
 * ultimo punto puede ser de una muestra anterior a la ultima recibida; en
 * ese caso se avisa en vez de mostrarlo como si fuera actual.
 */
export function latestValue(
  points: readonly ChartPoint[] | undefined,
  lastSampleAt: number | null,
): LatestValue | null {
  const last = points?.[points.length - 1];
  if (last === undefined) return null;
  return { value: last.v, t: last.t, current: lastSampleAt === null || last.t >= lastSampleAt };
}

export interface WindowStats {
  min: number;
  max: number;
  mean: number;
}

/** Minimo, maximo y promedio de lo que hay en la ventana (5 minutos). */
export function windowStats(points: readonly ChartPoint[] | undefined): WindowStats | null {
  if (points === undefined || points.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const { v } of points) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  return { min, max, mean: sum / points.length };
}

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
