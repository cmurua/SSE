// Ventana de analisis y reproduccion de una operacion historica (tarea 5.7),
// sin React: limites de la ventana, avance del cursor segun la velocidad,
// recorte de las series y teclado de los controles deslizantes. Separada de
// los componentes para probarla sin renderizar.
//
// Los tiempos son segundos desde el inicio de la operacion, como `start` y
// `end` de GET /historicals/operations/{id}/samples. La pantalla los muestra
// en minutos, pero las operaciones pueden durar segundos: con minutos enteros
// una operacion de 10 s no tendria ventana posible.
import type { ChartPoint } from "@/components/charts/types";
import { parseTimestamp } from "@/features/operation-viewer/services/samples";
import type { OperationDetail } from "@/types/operation";

/** Velocidades de reproduccion: cuantos segundos de operacion pasan por
 *  segundo real. 1x es tiempo real. */
export const PLAYBACK_SPEEDS = [1, 10, 60, 600] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];
/** D9: 60x por defecto, un minuto de operacion por segundo. */
export const DEFAULT_PLAYBACK_SPEED: PlaybackSpeed = 60;

/** Ventana [start, end] en segundos desde el inicio de la operacion. */
export interface AnalysisWindow {
  start: number;
  end: number;
}

/** Ancho minimo de la ventana: una muestra (el adquisidor publica a 1 Hz). */
export const MIN_WINDOW_SECONDS = 1;

/** Duracion en segundos, de los instantes de inicio y cierre. Una operacion
 *  historica siempre cerro; si igual faltara el cierre, la de minutos
 *  enteros. */
export function operationDurationSeconds(
  operation: Pick<OperationDetail, "started_at" | "ended_at" | "duration_minutes">,
): number {
  const start = parseTimestamp(operation.started_at);
  const end = operation.ended_at === null ? Number.NaN : parseTimestamp(operation.ended_at);
  const seconds = (end - start) / 1000;
  if (Number.isFinite(seconds) && seconds > 0) return seconds;
  return Math.max(0, (operation.duration_minutes ?? 0) * 60);
}

/** La operacion entera. */
export function fullWindow(durationSeconds: number): AnalysisWindow {
  return { start: 0, end: Math.max(0, durationSeconds) };
}

export function isFullWindow(win: AnalysisWindow, durationSeconds: number): boolean {
  return win.start <= 0 && win.end >= durationSeconds;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/** El ancho minimo, salvo que la operacion sea mas corta. */
function minGap(durationSeconds: number): number {
  return Math.min(MIN_WINDOW_SECONDS, durationSeconds);
}

/** Nuevo inicio: dentro de la operacion y antes del fin, con el ancho minimo.
 *  Un valor que no es un numero (un campo vacio) deja la ventana como estaba. */
export function withWindowStart(
  win: AnalysisWindow,
  start: number,
  durationSeconds: number,
): AnalysisWindow {
  if (!Number.isFinite(start)) return win;
  return { ...win, start: clamp(start, 0, win.end - minGap(durationSeconds)) };
}

/** Nuevo fin: dentro de la operacion y despues del inicio. */
export function withWindowEnd(
  win: AnalysisWindow,
  end: number,
  durationSeconds: number,
): AnalysisWindow {
  if (!Number.isFinite(end)) return win;
  return { ...win, end: clamp(end, win.start + minGap(durationSeconds), durationSeconds) };
}

/** El cursor siempre dentro de la ventana. */
export function clampCursor(cursor: number, win: AnalysisWindow): number {
  return clamp(cursor, win.start, win.end);
}

/**
 * Cursor despues de `elapsedMs` de reloj a `speed`. Al llegar al fin de la
 * ventana se queda ahi y `ended` avisa que hay que pausar.
 */
export function advanceCursor(
  cursor: number,
  elapsedMs: number,
  speed: number,
  win: AnalysisWindow,
): { cursor: number; ended: boolean } {
  const next = cursor + (Math.max(0, elapsedMs) / 1000) * speed;
  if (next >= win.end) return { cursor: win.end, ended: true };
  return { cursor: Math.max(win.start, next), ended: false };
}

/** Desde donde arranca Play: si el cursor ya llego al fin, desde el inicio. */
export function playFrom(cursor: number, win: AnalysisWindow): number {
  return cursor >= win.end ? win.start : clampCursor(cursor, win);
}

/** Primer indice con `t` >= `t` (busqueda binaria: las series estan
 *  ordenadas y se recortan en cada cuadro de la reproduccion). */
function lowerBound(points: readonly ChartPoint[], t: number): number {
  let lo = 0;
  let hi = points.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (points[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Primer indice con `t` > `t`. */
function upperBound(points: readonly ChartPoint[], t: number): number {
  let lo = 0;
  let hi = points.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (points[mid].t <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Los puntos de cada serie con `t` en [fromMs, toMs] (epoch ms). Con la
 * ventana, [inicio, cursor] es lo que se dibuja "como video"; con [inicio,
 * fin], las estadisticas de la ventana. Una serie que ya cabe entera se
 * devuelve tal cual, para no copiar en cada cuadro.
 */
export function sliceSeries(
  series: Record<string, ChartPoint[]>,
  fromMs: number,
  toMs: number,
): Record<string, ChartPoint[]> {
  const out: Record<string, ChartPoint[]> = {};
  for (const [id, points] of Object.entries(series)) {
    const lo = lowerBound(points, fromMs);
    const hi = upperBound(points, toMs);
    out[id] = lo === 0 && hi === points.length ? points : points.slice(lo, Math.max(lo, hi));
  }
  return out;
}

/** El `t` mas reciente entre las series: la ultima muestra que se ve en el
 *  cursor. null si no hay ninguna. */
export function lastPointAt(series: Record<string, readonly ChartPoint[]>): number | null {
  let last: number | null = null;
  for (const points of Object.values(series)) {
    const t = points[points.length - 1]?.t;
    if (t !== undefined && (last === null || t > last)) last = t;
  }
  return last;
}

/** Paso de los controles con el teclado: fino en una operacion corta y de a
 *  minuto en una larga, para no tener que apretar mil veces la flecha. */
export function sliderStep(durationSeconds: number): number {
  if (durationSeconds <= 600) return 1;
  if (durationSeconds <= 3600) return 10;
  return 60;
}

/**
 * Valor de un control deslizante despues de una tecla, como un
 * input type="range": flechas un paso, Re Pag / Av Pag diez, Inicio y Fin a
 * los extremos. null si la tecla no es del control.
 */
export function sliderKeyValue(
  key: string,
  value: number,
  { min, max, step }: { min: number; max: number; step: number },
): number | null {
  let next: number;
  switch (key) {
    case "ArrowRight":
    case "ArrowUp":
      next = value + step;
      break;
    case "ArrowLeft":
    case "ArrowDown":
      next = value - step;
      break;
    case "PageUp":
      next = value + step * 10;
      break;
    case "PageDown":
      next = value - step * 10;
      break;
    case "Home":
      next = min;
      break;
    case "End":
      next = max;
      break;
    default:
      return null;
  }
  return clamp(next, min, max);
}

/** Valor en una posicion del riel (0 = izquierda, 1 = derecha), redondeado
 *  al paso. Cerca de un extremo, el extremo: una operacion de 301,06 s se
 *  puede elegir entera aunque no sea multiplo del paso. */
export function valueAtFraction(fraction: number, min: number, max: number, step: number): number {
  const raw = min + clamp(fraction, 0, 1) * (max - min);
  if (max - raw < step / 2) return max;
  return clamp(Math.round(raw / step) * step, min, max);
}

/** Posicion de un valor en el riel, en %. */
export function percentOf(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return clamp(((value - min) / (max - min)) * 100, 0, 100);
}

/** Muestras que caen en la ventana, en proporcion a su ancho. Es una
 *  estimacion: si el backend redujo los puntos, la respuesta no dice cuantas
 *  habia. */
export function windowSampleCount(
  win: AnalysisWindow,
  durationSeconds: number,
  sampleCount: number,
): number {
  if (durationSeconds <= 0) return sampleCount;
  return Math.round((sampleCount * (win.end - win.start)) / durationSeconds);
}

/** Segundos a minutos con hasta `digits` decimales, en el idioma de la
 *  pantalla: "2,5" en es, "2.5" en en. */
export function formatMinutes(seconds: number, language: string, digits = 1): string {
  return new Intl.NumberFormat(language === "en" ? "en-US" : "es-AR", {
    maximumFractionDigits: digits,
  }).format(seconds / 60);
}

/** Valor de los campos Inicio y Fin: minutos con hasta 2 decimales y punto,
 *  como lo espera un input type="number". */
export function minutesFieldValue(seconds: number): string {
  return String(Math.round((seconds / 60) * 100) / 100);
}

/** Lo escrito en Inicio o Fin, a segundos. NaN si no es un numero. */
export function parseMinutesField(text: string): number {
  const trimmed = text.trim().replace(",", ".");
  if (trimmed === "") return Number.NaN;
  return Number(trimmed) * 60;
}

/** Marcas del riel: inicio, cuartos y fin de la operacion. */
export function rangeTicks(durationSeconds: number): number[] {
  return [0, 0.25, 0.5, 0.75, 1].map((f) => f * durationSeconds);
}
