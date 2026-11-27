import { describe, expect, it } from "vitest";
import {
  formatDuration,
  formatTime,
  formatValue,
  latestValue,
  windowStats,
} from "./instantValues";

describe("formatValue", () => {
  it("usa notacion cientifica para magnitudes muy grandes o muy chicas", () => {
    expect(formatValue(103_250)).toBe("1.03e5");
    expect(formatValue(0.0005)).toBe("5e-4");
    expect(formatValue(-0.00012)).toBe("-1.2e-4");
  });

  it("en el resto, unas 4 cifras con decimales fijos por magnitud", () => {
    expect(formatValue(1032.5)).toBe("1033");
    expect(formatValue(482.14)).toBe("482.1");
    expect(formatValue(48.3)).toBe("48.30");
    expect(formatValue(5.00736)).toBe("5.007");
    expect(formatValue(0.25)).toBe("0.2500");
    expect(formatValue(-300)).toBe("-300.0");
    expect(formatValue(0)).toBe("0");
  });

  it("no rompe con valores no finitos", () => {
    expect(formatValue(NaN)).toBe("—");
  });
});

describe("formatTime / formatDuration", () => {
  it("hora local del navegador", () => {
    expect(formatTime(new Date(2026, 10, 18, 9, 5, 7).getTime())).toBe("09:05:07");
  });

  it("duracion en horas, minutos y segundos", () => {
    expect(formatDuration(0)).toBe("00:00:00");
    expect(formatDuration(3_723_999)).toBe("01:02:03");
    expect(formatDuration(26 * 3_600_000)).toBe("26:00:00");
  });

  it("una duracion negativa (relojes desfasados) se muestra como cero", () => {
    expect(formatDuration(-5_000)).toBe("00:00:00");
  });
});

describe("latestValue", () => {
  const points = [
    { t: 1000, v: 1 },
    { t: 2000, v: 2 },
  ];

  it("el ultimo punto de la serie", () => {
    expect(latestValue(points, 2000)).toEqual({ value: 2, t: 2000, current: true });
  });

  it("avisa si la ultima muestra no trajo dato para la variable (null del canal)", () => {
    expect(latestValue(points, 3000)).toEqual({ value: 2, t: 2000, current: false });
  });

  it("sin puntos no hay valor", () => {
    expect(latestValue([], 1000)).toBeNull();
    expect(latestValue(undefined, null)).toBeNull();
  });
});

describe("windowStats", () => {
  it("minimo, maximo y promedio", () => {
    expect(windowStats([{ t: 1, v: 2 }, { t: 2, v: 4 }, { t: 3, v: 9 }])).toEqual({
      min: 2,
      max: 9,
      mean: 5,
    });
  });

  it("sin puntos no hay estadisticas", () => {
    expect(windowStats([])).toBeNull();
    expect(windowStats(undefined)).toBeNull();
  });
});
