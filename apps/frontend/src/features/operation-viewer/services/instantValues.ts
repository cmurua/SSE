// Logica del panel de valor instantaneo y de la franja de la operacion
// (tareas 3.7 y 5.3): formato de valores y horas, ultimo valor de cada
// variable y estadisticas de una serie. Funciones puras, separadas de los
// componentes para probarlas sin renderizar. No dependen de donde salen los
// datos (WebSocket o REST): las usan Tiempo Real y el historico.
import type { ChartPoint } from "@/components/charts/types";

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

/** Valor que muestra el panel para una variable. */
export interface InstantValue {
  value: number;
  t: number;
  /** false = la muestra que se esta mirando no trajo dato para esta
   *  variable (el canal publico null) y `value` es de una muestra anterior. */
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
): InstantValue | null {
  const last = points?.[points.length - 1];
  if (last === undefined) return null;
  return { value: last.v, t: last.t, current: lastSampleAt === null || last.t >= lastSampleAt };
}

export interface WindowStats {
  min: number;
  max: number;
  mean: number;
}

/** Minimo, maximo y promedio de los puntos de una serie: en Tiempo Real, la
 *  ventana de 5 minutos. */
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
