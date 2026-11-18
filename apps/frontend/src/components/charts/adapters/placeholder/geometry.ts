// Geometria del grafico variable vs. tiempo: escalas, marcas de los ejes,
// trazados y que eje usa cada variable. Funciones puras, sin React ni DOM,
// para probarlas sin renderizar. PlaceholderChartAdapter solo dibuja lo que
// devuelve computeTimeChart.
import type { ChartPoint, ChartVariable } from "../../types";

export const PADDING = { top: 16, bottom: 42, left: 64, right: 24, rightDual: 64 };

/** Cuantas marcas pedir en el eje Y. El resultado puede tener una o dos mas o
 *  menos: se priorizan los valores redondos. */
const Y_TICK_TARGET = 5;
/** Ancho minimo en px por marca del eje X, para que las horas no se pisen. */
const X_TICK_MIN_PX = 90;
/** Margen del eje Y respecto de los datos, como fraccion del rango. */
const Y_PADDING = 0.05;
/** Un hueco entre muestras de mas de GAP_FACTOR veces el intervalo tipico
 *  corta la linea: unir los extremos esconderia un corte de datos. */
const GAP_FACTOR = 3;

export type Scale = (value: number) => number;

export function linearScale(d0: number, d1: number, r0: number, r1: number): Scale {
  const span = d1 - d0 || 1;
  return (value) => r0 + ((value - d0) / span) * (r1 - r0);
}

// --- Eje Y ---------------------------------------------------------------

export interface NiceScale {
  min: number;
  max: number;
  step: number;
  ticks: number[];
}

/** Decimales que hacen falta para mostrar multiplos de `step` sin ruido de
 *  coma flotante (0.1 + 0.2). */
function stepDecimals(step: number): number {
  return Math.max(0, -Math.floor(Math.log10(step)));
}

function niceStep(rough: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const factor = normalized < 1.5 ? 1 : normalized < 3 ? 2 : normalized < 7 ? 5 : 10;
  return factor * magnitude;
}

/**
 * Escala con marcas redondas (1, 2 o 5 x 10^n) que cubre [lo, hi]. Los
 * extremos del eje caen en una marca. Un rango nulo (una senal constante) se
 * abre alrededor del valor para que la linea quede en el medio.
 */
export function niceScale(lo: number, hi: number, count = Y_TICK_TARGET): NiceScale {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) [lo, hi] = [0, 1];
  if (lo > hi) [lo, hi] = [hi, lo];
  if (lo === hi) {
    const pad = Math.abs(lo) * 0.1 || 1;
    [lo, hi] = [lo - pad, hi + pad];
  }

  const step = niceStep((hi - lo) / count);
  const decimals = stepDecimals(step);
  const first = Math.floor(lo / step);
  const last = Math.ceil(hi / step);
  const ticks: number[] = [];
  for (let i = first; i <= last; i++) ticks.push(Number((i * step).toFixed(decimals)) || 0);
  return { min: ticks[0], max: ticks[ticks.length - 1], step, ticks };
}

/** Etiqueta de una marca del eje Y. Notacion cientifica para magnitudes muy
 *  grandes o muy chicas; si no, los decimales que pide el paso. */
export function formatTick(value: number, step: number): string {
  const magnitude = Math.abs(value);
  if (magnitude !== 0 && (magnitude >= 1e5 || magnitude < 1e-3)) {
    const [mantissa, exponent] = value.toExponential().split("e");
    return `${Number(Number(mantissa).toPrecision(3))}e${Number(exponent)}`;
  }
  return value.toFixed(stepDecimals(step));
}

// --- Eje X (tiempo) -------------------------------------------------------

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const TIME_STEPS = [
  1, 2, 5, 10, 15, 30,
].map((s) => s * SECOND)
  .concat([1, 2, 5, 10, 15, 30].map((m) => m * MINUTE))
  .concat([1, 2, 3, 6, 12, 24].map((h) => h * HOUR));

/** Marcas del eje de tiempo en horas redondas del reloj (14:03:00,
 *  14:03:30...), no en posiciones fijas: asi no cambian de etiqueta en cada
 *  muestra mientras la ventana avanza. */
export function timeTicks(t0: number, t1: number, maxTicks: number) {
  const span = t1 - t0;
  const step = TIME_STEPS.find((s) => span / s <= maxTicks) ?? TIME_STEPS[TIME_STEPS.length - 1];
  const ticks: number[] = [];
  for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) ticks.push(t);
  return { step, ticks };
}

/** Hora local del navegador: "14:03:27", o "14:03" si no hacen falta los
 *  segundos. */
export function formatClock(t: number, withSeconds: boolean): string {
  const date = new Date(t);
  const parts = [date.getHours(), date.getMinutes()];
  if (withSeconds) parts.push(date.getSeconds());
  return parts.map((n) => String(n).padStart(2, "0")).join(":");
}

// --- Trazados -------------------------------------------------------------

/** Hueco a partir del cual se corta la linea: GAP_FACTOR veces la mediana
 *  del intervalo entre muestras. Se deduce de los datos para que sirva igual
 *  a 1 Hz en vivo que con otra cadencia en los historicos. */
export function gapThreshold(points: readonly ChartPoint[]): number {
  if (points.length < 2) return Infinity;
  const deltas: number[] = [];
  for (let i = 1; i < points.length; i++) deltas.push(points[i].t - points[i - 1].t);
  deltas.sort((a, b) => a - b);
  return deltas[Math.floor(deltas.length / 2)] * GAP_FACTOR;
}

/** Parte la serie donde hay un hueco mayor que `maxGap`. */
export function splitAtGaps(points: readonly ChartPoint[], maxGap: number): ChartPoint[][] {
  const segments: ChartPoint[][] = [];
  let current: ChartPoint[] = [];
  for (const point of points) {
    const previous = current[current.length - 1];
    if (previous !== undefined && point.t - previous.t > maxGap) {
      segments.push(current);
      current = [];
    }
    current.push(point);
  }
  if (current.length > 0) segments.push(current);
  return segments;
}

const px = (n: number) => n.toFixed(1);

// --- Grafico completo -----------------------------------------------------

export type AxisSide = "left" | "right";

export interface ChartSeriesLayout {
  id: string;
  name: string;
  unit: string;
  /** 0 = Variable A, 1 = Variable B. */
  index: number;
  axis: AxisSide;
  line: string;
  area: string;
  /** Muestras sueltas (un tramo de un solo punto): sin linea que dibujar,
   *  se marcan con un punto para que no desaparezcan. */
  dots: { x: number; y: number }[];
}

export interface YAxisLayout {
  side: AxisSide;
  /** Variable cuyo color lleva el eje. null = compartido por las dos. */
  seriesIndex: number | null;
  title: string;
  ticks: { y: number; label: string }[];
}

export interface TimeChartLayout {
  plot: { left: number; top: number; width: number; height: number };
  series: ChartSeriesLayout[];
  yAxes: YAxisLayout[];
  xTicks: { x: number; label: string }[];
  /** Intervalo de tiempo que cubre el eje X (epoch ms). */
  domain: [number, number];
}

export interface TimeChartInput {
  variables: readonly ChartVariable[];
  data: Record<string, readonly ChartPoint[]>;
  width: number;
  height: number;
  /** Ancho fijo del eje X, con el borde derecho en la ultima muestra. Sin
   *  el, el eje se ajusta a los datos. */
  timeWindowMs?: number;
}

/**
 * Todo lo que hace falta para dibujar 1 o 2 variables contra el tiempo, o
 * null si todavia no hay ninguna muestra.
 *
 * Con dos variables de distinta unidad cada una tiene su eje Y (A a la
 * izquierda, B a la derecha). Con la misma unidad comparten uno: dos ejes
 * con escalas distintas para la misma magnitud sugeririan una comparacion
 * que no es real.
 */
export function computeTimeChart({
  variables,
  data,
  width,
  height,
  timeWindowMs,
}: TimeChartInput): TimeChartLayout | null {
  const series = variables.slice(0, 2).map((variable, index) => ({
    variable,
    index,
    points: data[variable.id] ?? [],
  }));
  const withData = series.filter((s) => s.points.length > 0);
  if (withData.length === 0) return null;

  // Eje X
  const x1 = Math.max(...withData.map((s) => s.points[s.points.length - 1].t));
  let x0 =
    timeWindowMs !== undefined ? x1 - timeWindowMs : Math.min(...withData.map((s) => s.points[0].t));
  if (x0 >= x1) x0 = x1 - SECOND;

  const dual = series.length === 2 && series[0].variable.unit !== series[1].variable.unit;
  const plot = {
    left: PADDING.left,
    top: PADDING.top,
    width: Math.max(1, width - PADDING.left - (dual ? PADDING.rightDual : PADDING.right)),
    height: Math.max(1, height - PADDING.top - PADDING.bottom),
  };
  const bottom = plot.top + plot.height;
  const xScale = linearScale(x0, x1, plot.left, plot.left + plot.width);

  // Solo lo que cae en la ventana decide la escala Y. Al dibujar se agrega la
  // muestra anterior a la ventana, para que la linea entre desde el borde (el
  // clipPath del SVG recorta lo que sobra).
  const drawable = series.map(({ points }) => {
    const firstVisible = points.findIndex((p) => p.t >= x0);
    if (firstVisible === -1) return { visible: [], drawn: [] };
    return { visible: points.slice(firstVisible), drawn: points.slice(Math.max(0, firstVisible - 1)) };
  });

  // Ejes Y
  const groups: { side: AxisSide; members: number[] }[] = dual
    ? [
        { side: "left", members: [0] },
        { side: "right", members: [1] },
      ]
    : [{ side: "left", members: series.map((s) => s.index) }];

  const yAxes: YAxisLayout[] = [];
  const yScaleOf: Scale[] = [];
  for (const group of groups) {
    const values = group.members.flatMap((i) => drawable[i].visible.map((p) => p.v));
    let lo = values.length > 0 ? Math.min(...values) : 0;
    let hi = values.length > 0 ? Math.max(...values) : 1;
    const pad = (hi - lo) * Y_PADDING;
    [lo, hi] = [lo - pad, hi + pad];
    const nice = niceScale(lo, hi);
    const yScale = linearScale(nice.min, nice.max, bottom, plot.top);
    for (const i of group.members) yScaleOf[i] = yScale;

    const only = group.members.length === 1 ? series[group.members[0]].variable : null;
    yAxes.push({
      side: group.side,
      seriesIndex: dual ? group.members[0] : null,
      // Un eje por variable lleva su nombre; compartido, solo la unidad (los
      // nombres estan en la leyenda).
      title: only ? `${only.name} [${only.unit}]` : `[${series[0].variable.unit}]`,
      ticks: nice.ticks.map((v) => ({ y: yScale(v), label: formatTick(v, nice.step) })),
    });
  }

  // Trazados
  const layouts: ChartSeriesLayout[] = series.map(({ variable, index, points }) => {
    const yScale = yScaleOf[index];
    const segments = splitAtGaps(drawable[index].drawn, gapThreshold(points));
    const lines: string[] = [];
    const areas: string[] = [];
    const dots: { x: number; y: number }[] = [];
    for (const segment of segments) {
      const coords = segment.map((p) => [xScale(p.t), yScale(p.v)] as const);
      if (coords.length === 1) {
        dots.push({ x: coords[0][0], y: coords[0][1] });
        continue;
      }
      const path = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${px(x)} ${px(y)}`).join(" ");
      lines.push(path);
      const firstX = px(coords[0][0]);
      const lastX = px(coords[coords.length - 1][0]);
      areas.push(`M ${firstX} ${px(bottom)} ${path.replace(/^M/, "L")} L ${lastX} ${px(bottom)} Z`);
    }
    return {
      id: variable.id,
      name: variable.name,
      unit: variable.unit,
      index,
      axis: dual && index === 1 ? "right" : "left",
      line: lines.join(" "),
      area: areas.join(" "),
      dots,
    };
  });

  // Marcas del eje X
  const maxTicks = Math.max(2, Math.floor(plot.width / X_TICK_MIN_PX));
  const time = timeTicks(x0, x1, maxTicks);
  const xTicks = time.ticks.map((t) => ({
    x: xScale(t),
    label: formatClock(t, time.step < MINUTE),
  }));

  return { plot, series: layouts, yAxes, xTicks, domain: [x0, x1] };
}
