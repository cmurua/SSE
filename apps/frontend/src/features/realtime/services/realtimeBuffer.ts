// Ventana deslizante de muestras en vivo, por variable. Funciones puras: cada
// una devuelve un buffer nuevo y no toca el anterior, asi React puede comparar
// por referencia que cambio.
//
// `series` tiene la forma de ChartRendererProps.data, para pasarla directo al
// grafico (tareas 3.5 y 3.6).
import type { ChartPoint } from "@/components/charts/types";
import type { RealtimeSample } from "@/types/realtime";
import { parseTimestamp } from "@/features/operation-viewer/services/samples";

/** Puntos por variable: 5 minutos a 1 Hz. Pasado eso se descartan los mas
 *  viejos, para que una operacion larga no haga crecer la memoria. */
export const REALTIME_WINDOW_POINTS = 300;

/** Lo que cubre la ventana en tiempo, a la cadencia de 1 Hz de la toma de
 *  datos. Es el ancho del eje X del grafico en vivo. */
export const REALTIME_WINDOW_MS = REALTIME_WINDOW_POINTS * 1000;

export interface RealtimeBuffer {
  /** Operacion a la que pertenecen los datos. null = todavia ninguna. */
  operationId: string | null;
  series: Record<string, ChartPoint[]>;
  /** `timestamp` de la ultima muestra (epoch ms, reloj del servidor). */
  lastSampleAt: number | null;
}

export const EMPTY_BUFFER: RealtimeBuffer = { operationId: null, series: {}, lastSampleAt: null };

/** El buffer listo para `operationId`: el mismo si ya es de esa operacion, uno
 *  vacio si no. Los datos de una operacion nunca se mezclan con los de otra. */
export function forOperation(buffer: RealtimeBuffer, operationId: string): RealtimeBuffer {
  if (buffer.operationId === operationId) return buffer;
  return { ...EMPTY_BUFFER, operationId };
}

/**
 * Agrega una muestra. Solo guarda las variables de `selection` (las elegidas
 * y las que el servidor manda siempre): el servidor puede mandar una muestra
 * con la seleccion anterior despues de que el cliente pidio otra, y esa
 * variable no tiene que reaparecer.
 *
 * Un valor `null` no se guarda: dibujarlo como 0 seria inventar una caida.
 * Una muestra que no es posterior a la ultima de la serie (repetida o
 * desordenada) tampoco, para que cada serie quede ordenada por tiempo.
 */
export function appendSample(
  buffer: RealtimeBuffer,
  sample: RealtimeSample,
  selection: readonly string[],
  limit: number = REALTIME_WINDOW_POINTS,
): RealtimeBuffer {
  const t = parseTimestamp(sample.timestamp);
  if (Number.isNaN(t)) return buffer;

  const base = forOperation(buffer, sample.operation_id);
  let series = base.series;
  for (const id of selection) {
    const v = sample.values[id];
    if (typeof v !== "number" || !Number.isFinite(v)) continue;

    const current = series[id] ?? [];
    const last = current.at(-1);
    if (last !== undefined && t <= last.t) continue;

    const next = current.length >= limit ? current.slice(current.length - limit + 1) : current.slice();
    next.push({ t, v });
    if (series === base.series) series = { ...series };
    series[id] = next;
  }

  const lastSampleAt = base.lastSampleAt === null ? t : Math.max(base.lastSampleAt, t);
  if (series === base.series && lastSampleAt === base.lastSampleAt) return base;
  return { ...base, series, lastSampleAt };
}

/** Deja solo las series de `selection`. Las que siguen elegidas conservan sus
 *  datos; una variable nueva empieza vacia (el servidor no manda pasado). */
export function retainVariables(
  buffer: RealtimeBuffer,
  selection: readonly string[],
): RealtimeBuffer {
  const ids = Object.keys(buffer.series);
  if (ids.every((id) => selection.includes(id))) return buffer;

  const series: Record<string, ChartPoint[]> = {};
  for (const id of ids) {
    if (selection.includes(id)) series[id] = buffer.series[id];
  }
  return { ...buffer, series };
}
