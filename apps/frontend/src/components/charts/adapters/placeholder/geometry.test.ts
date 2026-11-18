import { describe, expect, it } from "vitest";
import type { ChartPoint, ChartVariable } from "../../types";
import {
  computeTimeChart,
  computeXYChart,
  pairByTimestamp,
  formatClock,
  formatTick,
  gapThreshold,
  niceScale,
  splitAtGaps,
  timeTicks,
} from "./geometry";

const T0 = new Date(2026, 10, 18, 14, 0, 0).getTime(); // hora local
const POT: ChartVariable = { id: "POTM4", name: "Potencia", unit: "W" };
const REA: ChartVariable = { id: "REACTM4", name: "Reactividad", unit: "pcm" };
const BC1: ChartVariable = { id: "POSBC1", name: "Barra 1", unit: "%" };
const BC2: ChartVariable = { id: "POSBC2", name: "Barra 2", unit: "%" };

/** Una muestra por segundo, desde `start` segundos despues de T0. */
function series(values: number[], start = 0): ChartPoint[] {
  return values.map((v, i) => ({ t: T0 + (start + i) * 1000, v }));
}

describe("niceScale", () => {
  it("usa marcas redondas que cubren el rango", () => {
    const scale = niceScale(4.981, 5.019);
    expect(scale.step).toBe(0.01);
    expect(scale.ticks).toEqual([4.98, 4.99, 5, 5.01, 5.02]);
  });

  it("los extremos del eje caen en una marca", () => {
    const scale = niceScale(3, 97);
    expect(scale.min).toBe(0);
    expect(scale.max).toBe(100);
    expect(scale.step).toBe(20);
  });

  it("abre un rango nulo alrededor del valor (senal constante)", () => {
    const scale = niceScale(5, 5);
    expect(scale.min).toBeLessThan(5);
    expect(scale.max).toBeGreaterThan(5);
    expect(niceScale(0, 0).ticks.length).toBeGreaterThan(1);
  });

  it("no arrastra ruido de coma flotante", () => {
    for (const tick of niceScale(0.1, 0.7).ticks) {
      expect(String(tick).length).toBeLessThanOrEqual(4);
    }
  });
});

describe("formatTick", () => {
  it("muestra los decimales que pide el paso", () => {
    expect(formatTick(5, 0.01)).toBe("5.00");
    expect(formatTick(40, 20)).toBe("40");
    expect(formatTick(0.5, 0.5)).toBe("0.5");
  });

  it("usa notacion cientifica para magnitudes extremas", () => {
    expect(formatTick(100000, 20000)).toBe("1e5");
    expect(formatTick(0.0005, 0.0001)).toBe("5e-4");
    expect(formatTick(0, 0.0001)).toBe("0.0000");
  });
});

describe("eje de tiempo", () => {
  it("elige el paso para no pasarse de las marcas pedidas", () => {
    const fiveMinutes = timeTicks(T0, T0 + 300_000, 6);
    expect(fiveMinutes.step).toBe(60_000);
    expect(fiveMinutes.ticks).toHaveLength(6);

    expect(timeTicks(T0, T0 + 10_000, 6).step).toBe(2_000);
  });

  it("pone las marcas en horas redondas del reloj", () => {
    const { ticks } = timeTicks(T0 + 12_345, T0 + 60_000, 4);
    expect(ticks[0]).toBe(T0 + 15_000);
    expect(ticks.every((t) => (t - T0) % 15_000 === 0)).toBe(true);
  });

  it("formatea en hora local, con o sin segundos", () => {
    expect(formatClock(T0 + 3 * 60_000 + 7_000, true)).toBe("14:03:07");
    expect(formatClock(T0 + 3 * 60_000, false)).toBe("14:03");
  });
});

describe("huecos", () => {
  it("corta la serie donde falta mas de 3 veces el intervalo tipico", () => {
    const points = [...series([1, 2, 3]), ...series([4, 5], 10)];
    expect(gapThreshold(points)).toBe(3_000);
    const segments = splitAtGaps(points, gapThreshold(points));
    expect(segments.map((s) => s.map((p) => p.v))).toEqual([[1, 2, 3], [4, 5]]);
  });

  it("con menos de dos puntos no hay hueco que medir", () => {
    expect(gapThreshold(series([1]))).toBe(Infinity);
  });
});

describe("computeTimeChart", () => {
  const size = { width: 800, height: 360 };

  it("sin muestras devuelve null (el adapter muestra 'esperando datos')", () => {
    expect(computeTimeChart({ ...size, variables: [POT], data: {} })).toBeNull();
    expect(computeTimeChart({ ...size, variables: [POT], data: { POTM4: [] } })).toBeNull();
  });

  it("con ventana fija, el eje X termina en la ultima muestra y cubre la ventana", () => {
    const chart = computeTimeChart({
      ...size,
      variables: [POT],
      data: { POTM4: series([5, 5.1, 5.2], 100) },
      timeWindowMs: 300_000,
    })!;
    expect(chart.domain).toEqual([T0 + 102_000 - 300_000, T0 + 102_000]);
  });

  it("sin ventana, el eje X se ajusta a los datos", () => {
    const chart = computeTimeChart({
      ...size,
      variables: [POT],
      data: { POTM4: series([5, 5.1, 5.2], 100) },
    })!;
    expect(chart.domain).toEqual([T0 + 100_000, T0 + 102_000]);
  });

  it("la escala Y sale solo de lo visible en la ventana", () => {
    // Un pico viejo, fuera de la ventana de 10 s, no aplasta la escala.
    const data = { POTM4: [{ t: T0, v: 1000 }, ...series([5, 5.01, 5.02], 100)] };
    const chart = computeTimeChart({ ...size, variables: [POT], data, timeWindowMs: 10_000 })!;
    const labels = chart.yAxes[0].ticks.map((t) => Number(t.label));
    expect(Math.max(...labels)).toBeLessThan(6);
  });

  it("una variable: un eje con su nombre y unidad", () => {
    const chart = computeTimeChart({ ...size, variables: [POT], data: { POTM4: series([5, 6]) } })!;
    expect(chart.yAxes).toHaveLength(1);
    expect(chart.yAxes[0]).toMatchObject({ side: "left", title: "Potencia [W]", seriesIndex: null });
    expect(chart.series[0].line).toMatch(/^M [\d.]+ [\d.]+ L/);
    expect(chart.series[0].area).toMatch(/Z$/);
  });

  it("dos variables de distinta unidad: doble eje, A a la izquierda y B a la derecha", () => {
    const chart = computeTimeChart({
      ...size,
      variables: [POT, REA],
      data: { POTM4: series([5, 6]), REACTM4: series([-200, 100]) },
    })!;
    expect(chart.yAxes.map((a) => [a.side, a.seriesIndex, a.title])).toEqual([
      ["left", 0, "Potencia [W]"],
      ["right", 1, "Reactividad [pcm]"],
    ]);
    expect(chart.series.map((s) => s.axis)).toEqual(["left", "right"]);
  });

  it("dos variables de la misma unidad comparten un eje que cubre a las dos", () => {
    const chart = computeTimeChart({
      ...size,
      variables: [BC1, BC2],
      data: { POSBC1: series([10, 12]), POSBC2: series([80, 85]) },
    })!;
    expect(chart.yAxes).toHaveLength(1);
    expect(chart.yAxes[0].title).toBe("[%]");
    const labels = chart.yAxes[0].ticks.map((t) => Number(t.label));
    expect(Math.min(...labels)).toBeLessThanOrEqual(10);
    expect(Math.max(...labels)).toBeGreaterThanOrEqual(85);
  });

  it("corta la linea en un hueco y marca con un punto una muestra suelta", () => {
    const data = { POTM4: [...series([1, 2, 3]), ...series([4], 20), ...series([5, 6], 40)] };
    const chart = computeTimeChart({ ...size, variables: [POT], data })!;
    expect(chart.series[0].line.match(/M /g)).toHaveLength(2);
    expect(chart.series[0].dots).toHaveLength(1);
  });

  it("todas las coordenadas son numeros finitos", () => {
    const chart = computeTimeChart({
      ...size,
      variables: [POT],
      data: { POTM4: series([5, 5, 5]) },
      timeWindowMs: 300_000,
    })!;
    const numbers = chart.series[0].line.split(" ").filter((s) => !/[A-Z]/.test(s));
    expect(numbers.every((n) => Number.isFinite(Number(n)))).toBe(true);
  });
});

describe("pairByTimestamp", () => {
  it("empareja los valores tomados en el mismo instante", () => {
    expect(pairByTimestamp(series([1, 2, 3]), series([10, 20, 30]))).toEqual([
      { t: T0, x: 1, y: 10 },
      { t: T0 + 1000, x: 2, y: 20 },
      { t: T0 + 2000, x: 3, y: 30 },
    ]);
  });

  it("un instante que falta en una serie (null del canal) no forma par ni desfasa los demas", () => {
    // B no publico en t=1: emparejar por indice uniria 2 con 30 y 3 con nada.
    const b = [series([10])[0], ...series([30], 2)];
    expect(pairByTimestamp(series([1, 2, 3]), b)).toEqual([
      { t: T0, x: 1, y: 10 },
      { t: T0 + 2000, x: 3, y: 30 },
    ]);
  });

  it("sin instantes en comun no hay pares", () => {
    expect(pairByTimestamp(series([1, 2]), series([5, 6], 10))).toEqual([]);
    expect(pairByTimestamp([], series([1]))).toEqual([]);
  });
});

describe("computeXYChart", () => {
  const size = { width: 800, height: 360 };

  it("null con menos de 2 variables o sin pares", () => {
    expect(computeXYChart({ ...size, variables: [POT], data: { POTM4: series([1]) } })).toBeNull();
    expect(computeXYChart({ ...size, variables: [POT, REA], data: { POTM4: series([1]) } })).toBeNull();
  });

  it("A en el eje X y B en el eje Y, cada uno con nombre y unidad", () => {
    const chart = computeXYChart({
      ...size,
      variables: [POT, REA],
      data: { POTM4: series([4, 5, 6]), REACTM4: series([-100, 0, 100]) },
    })!;
    expect(chart.xAxis.title).toBe("Potencia [W]");
    expect(chart.yAxis.title).toBe("Reactividad [pcm]");
    const xs = chart.xAxis.ticks.map((t) => Number(t.label));
    const ys = chart.yAxis.ticks.map((t) => Number(t.label));
    expect(Math.min(...xs)).toBeLessThanOrEqual(4);
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(6);
    expect(Math.min(...ys)).toBeLessThanOrEqual(-100);
    expect(Math.max(...ys)).toBeGreaterThanOrEqual(100);
  });

  it("resalta el par mas reciente", () => {
    const chart = computeXYChart({
      ...size,
      variables: [POT, REA],
      data: { POTM4: series([4, 5, 6]), REACTM4: series([-100, 0, 100]) },
    })!;
    // El ultimo par (6, 100) es el final de la trayectoria y, en estos datos,
    // el de mas a la derecha y mas arriba (y menor en px).
    expect(chart.line.endsWith(`${chart.current.x.toFixed(1)} ${chart.current.y.toFixed(1)}`)).toBe(true);
    const coords = chart.line.match(/[\d.]+ [\d.]+/g)!.map((pair) => pair.split(" ").map(Number));
    expect(chart.current.x).toBeCloseTo(Math.max(...coords.map(([x]) => x)), 0);
    expect(chart.current.y).toBeCloseTo(Math.min(...coords.map(([, y]) => y)), 0);
  });

  it("con ventana, solo dibuja los pares de esa ventana", () => {
    const data = {
      POTM4: [{ t: T0, v: 1000 }, ...series([5, 5.1], 100)],
      REACTM4: [{ t: T0, v: 0 }, ...series([0, 1], 100)],
    };
    const chart = computeXYChart({ ...size, variables: [POT, REA], data, timeWindowMs: 10_000 })!;
    expect(chart.domain).toEqual([T0 + 100_000, T0 + 101_000]);
    expect(Math.max(...chart.xAxis.ticks.map((t) => Number(t.label)))).toBeLessThan(6);
  });

  it("corta la trayectoria en un hueco de tiempo", () => {
    const data = {
      POTM4: [...series([1, 2, 3]), ...series([4, 5], 30)],
      REACTM4: [...series([1, 2, 3]), ...series([4, 5], 30)],
    };
    const chart = computeXYChart({ ...size, variables: [POT, REA], data })!;
    expect(chart.line.match(/M /g)).toHaveLength(2);
  });
});
