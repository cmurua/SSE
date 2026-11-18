// Estadisticas del medidor de latencia de la pantalla de tiempo real (tarea
// 3.8, RNF01). Funciones puras: el hook useLatencyProbe solo junta las
// mediciones.

/** RNF01: de la muestra a la pantalla en 2 s o menos. */
export const LATENCY_LIMIT_MS = 2_000;

export interface LatencySummary {
  n: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  /** Cuantas superaron LATENCY_LIMIT_MS. */
  overLimit: number;
}

/** Percentil por el metodo del rango mas cercano, sobre valores ordenados. */
function percentile(sorted: readonly number[], q: number): number {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((q / 100) * (sorted.length - 1))));
  return sorted[index];
}

export function summarizeLatencies(values: readonly number[]): LatencySummary | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: sorted.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted[sorted.length - 1],
    overLimit: sorted.filter((v) => v > LATENCY_LIMIT_MS).length,
  };
}

/** El medidor se activa con `?latencia` en la URL. */
export function latencyProbeEnabled(search: string): boolean {
  return new URLSearchParams(search).has("latencia");
}

/**
 * Si la medicion de una muestra quedo afectada por la pestana oculta: lo esta
 * ahora, o se volvio a mostrar despues de que se tomo la muestra (o sea, la
 * muestra espero a que la pestana estuviera visible para dibujarse). Con la
 * pestana oculta el navegador no dibuja, y la medicion pasaria a medir eso y
 * no la transmision.
 */
export function measuredWhileHidden({
  hiddenNow,
  shownAt,
  sampleAt,
}: {
  hiddenNow: boolean;
  /** Ultima vez que la pestana paso a visible (epoch ms); 0 si nunca se oculto. */
  shownAt: number;
  sampleAt: number;
}): boolean {
  return hiddenNow || shownAt > sampleAt;
}
