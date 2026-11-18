import { describe, expect, it } from "vitest";
import {
  LATENCY_LIMIT_MS,
  latencyProbeEnabled,
  measuredWhileHidden,
  summarizeLatencies,
} from "./latencyStats";

describe("summarizeLatencies", () => {
  it("mediana, percentiles y maximo", () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    expect(summarizeLatencies(values)).toEqual({
      n: 100,
      p50: 51,
      p95: 95,
      p99: 99,
      max: 100,
      overLimit: 0,
    });
  });

  it("cuenta las que superan el limite del RNF01", () => {
    expect(LATENCY_LIMIT_MS).toBe(2000);
    expect(summarizeLatencies([100, 2000, 2001, 3500])?.overLimit).toBe(2);
  });

  it("no depende del orden de llegada", () => {
    expect(summarizeLatencies([30, 10, 20])?.p50).toBe(20);
  });

  it("sin mediciones no hay resumen", () => {
    expect(summarizeLatencies([])).toBeNull();
  });
});

describe("latencyProbeEnabled", () => {
  it("solo con ?latencia en la URL", () => {
    expect(latencyProbeEnabled("?latencia")).toBe(true);
    expect(latencyProbeEnabled("?foo=1&latencia=1")).toBe(true);
    expect(latencyProbeEnabled("")).toBe(false);
    expect(latencyProbeEnabled("?latencias")).toBe(false);
  });
});

describe("measuredWhileHidden", () => {
  it("valida si la pestana estuvo visible todo el tiempo", () => {
    expect(measuredWhileHidden({ hiddenNow: false, shownAt: 0, sampleAt: 5_000 })).toBe(false);
    // Se oculto y volvio ANTES de que se tomara la muestra: no la afecto.
    expect(measuredWhileHidden({ hiddenNow: false, shownAt: 4_000, sampleAt: 5_000 })).toBe(false);
  });

  it("descarta si la pestana esta oculta al medir", () => {
    expect(measuredWhileHidden({ hiddenNow: true, shownAt: 0, sampleAt: 5_000 })).toBe(true);
  });

  it("descarta si la pestana volvio a estar visible despues de tomada la muestra", () => {
    // La muestra espero a que se viera la pestana para dibujarse.
    expect(measuredWhileHidden({ hiddenNow: false, shownAt: 6_000, sampleAt: 5_000 })).toBe(true);
  });
});
