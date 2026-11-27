// Muestras del backend a series del grafico. Las muestras tienen la misma
// forma en Tiempo Real (evento `sample` de realtime.samples) y en el
// historico (GET /historicals/operations/{id}/samples): RealtimeSample.
// Funciones puras, sin saber de donde salen.
import type { ChartPoint } from "@/components/charts/types";
import type { RealtimeSample } from "@/types/realtime";

/** Epoch ms de un timestamp ISO del backend. Pydantic manda microsegundos
 *  (`.512000Z`), pero el formato que el estandar obliga a aceptar a
 *  Date.parse tiene exactamente 3 decimales: con mas, depende del navegador.
 *  Se recorta a milisegundos para no perder todas las muestras en uno que
 *  devuelva NaN. */
export function parseTimestamp(iso: string): number {
  return Date.parse(iso.replace(/(\.\d{3})\d+/, "$1"));
}

export interface SampleSeries {
  /** Puntos por variable, ordenados por `t`. Forma de ChartRendererProps.data. */
  series: Record<string, ChartPoint[]>;
  /** `timestamp` de la ultima muestra (epoch ms); null si no hay ninguna. */
  lastSampleAt: number | null;
}

/**
 * Series de `variableIds` a partir de una lista de muestras, con las mismas
 * reglas que el buffer de Tiempo Real: un valor `null` no se guarda (dibujarlo
 * como 0 seria inventar una caida) y una muestra que no es posterior a la
 * ultima de su serie tampoco, para que cada serie quede ordenada. Toda
 * variable pedida tiene su serie, aunque quede vacia.
 */
export function samplesToSeries(
  samples: readonly RealtimeSample[],
  variableIds: readonly string[],
): SampleSeries {
  const series: Record<string, ChartPoint[]> = {};
  for (const id of variableIds) series[id] = [];

  let lastSampleAt: number | null = null;
  for (const sample of samples) {
    const t = parseTimestamp(sample.timestamp);
    if (Number.isNaN(t)) continue;
    for (const id of variableIds) {
      const v = sample.values[id];
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      const points = series[id];
      const last = points[points.length - 1];
      if (last !== undefined && t <= last.t) continue;
      points.push({ t, v });
    }
    if (lastSampleAt === null || t > lastSampleAt) lastSampleAt = t;
  }
  return { series, lastSampleAt };
}
