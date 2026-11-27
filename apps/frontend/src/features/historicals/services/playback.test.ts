import { describe, expect, it } from "vitest";
import type { ChartPoint } from "@/components/charts/types";
import {
  advanceCursor,
  clampCursor,
  DEFAULT_PLAYBACK_SPEED,
  formatMinutes,
  fullWindow,
  isFullWindow,
  lastPointAt,
  minutesFieldValue,
  operationDurationSeconds,
  parseMinutesField,
  percentOf,
  playFrom,
  PLAYBACK_SPEEDS,
  rangeTicks,
  sliceSeries,
  sliderKeyValue,
  sliderStep,
  valueAtFraction,
  windowSampleCount,
  withWindowEnd,
  withWindowStart,
} from "./playback";

const HOUR = 3600;

describe("velocidades", () => {
  it("son 1x, 10x, 60x y 600x, con 60x por defecto (D9)", () => {
    expect(PLAYBACK_SPEEDS).toEqual([1, 10, 60, 600]);
    expect(DEFAULT_PLAYBACK_SPEED).toBe(60);
  });
});

describe("operationDurationSeconds", () => {
  const op = {
    started_at: "2026-04-10T01:30:00.000000Z",
    ended_at: "2026-04-10T01:30:10.500000Z",
    duration_minutes: 0,
  };

  it("sale de inicio y cierre, con segundos: una operacion de 10 s no dura 0", () => {
    expect(operationDurationSeconds(op)).toBe(10.5);
  });

  it("sin cierre usa los minutos enteros", () => {
    expect(operationDurationSeconds({ ...op, ended_at: null, duration_minutes: 125 })).toBe(7500);
    expect(operationDurationSeconds({ ...op, ended_at: null, duration_minutes: null })).toBe(0);
  });
});

describe("limites de la ventana", () => {
  const duration = 2 * HOUR;
  const win = { start: 600, end: 3600 };

  it("arranca con la operacion entera", () => {
    expect(fullWindow(duration)).toEqual({ start: 0, end: duration });
    expect(isFullWindow(fullWindow(duration), duration)).toBe(true);
    expect(isFullWindow(win, duration)).toBe(false);
  });

  it("el inicio no baja de 0 ni pasa al fin", () => {
    expect(withWindowStart(win, 1200, duration)).toEqual({ start: 1200, end: 3600 });
    expect(withWindowStart(win, -50, duration)).toEqual({ start: 0, end: 3600 });
    // Deja el ancho minimo de 1 s.
    expect(withWindowStart(win, 9999, duration)).toEqual({ start: 3599, end: 3600 });
  });

  it("el fin no pasa la duracion ni baja del inicio", () => {
    expect(withWindowEnd(win, 4000, duration)).toEqual({ start: 600, end: 4000 });
    expect(withWindowEnd(win, 99999, duration)).toEqual({ start: 600, end: duration });
    expect(withWindowEnd(win, 0, duration)).toEqual({ start: 600, end: 601 });
  });

  it("un campo vacio no cambia la ventana", () => {
    expect(withWindowStart(win, Number.NaN, duration)).toBe(win);
    expect(withWindowEnd(win, Number.NaN, duration)).toBe(win);
  });

  it("una operacion mas corta que el ancho minimo igual tiene ventana", () => {
    expect(withWindowEnd({ start: 0, end: 0.5 }, 0, 0.5)).toEqual({ start: 0, end: 0.5 });
  });

  it("el cursor queda dentro de la ventana", () => {
    expect(clampCursor(100, win)).toBe(600);
    expect(clampCursor(2000, win)).toBe(2000);
    expect(clampCursor(5000, win)).toBe(3600);
  });
});

describe("avance segun la velocidad", () => {
  const win = { start: 0, end: 600 };

  it("1x es tiempo real: 1 s de operacion por segundo", () => {
    expect(advanceCursor(10, 1000, 1, win)).toEqual({ cursor: 11, ended: false });
  });

  it("a 60x un segundo de reloj es un minuto de operacion", () => {
    expect(advanceCursor(10, 1000, 60, win)).toEqual({ cursor: 70, ended: false });
    expect(advanceCursor(10, 16, 60, win).cursor).toBeCloseTo(10.96);
  });

  it("a 10x y 600x", () => {
    expect(advanceCursor(0, 500, 10, win).cursor).toBe(5);
    expect(advanceCursor(0, 500, 600, win)).toEqual({ cursor: 300, ended: false });
  });

  it("al llegar al fin de la ventana se queda ahi y avisa", () => {
    expect(advanceCursor(590, 1000, 60, win)).toEqual({ cursor: 600, ended: true });
  });

  it("un tiempo negativo no hace retroceder", () => {
    expect(advanceCursor(10, -1000, 60, win).cursor).toBe(10);
  });

  it("Play al final arranca desde el inicio; si no, desde el cursor", () => {
    const partial = { start: 100, end: 600 };
    expect(playFrom(600, partial)).toBe(100);
    expect(playFrom(300, partial)).toBe(300);
    expect(playFrom(50, partial)).toBe(100);
  });
});

describe("recorte de las series", () => {
  const points = (...ts: number[]): ChartPoint[] => ts.map((t) => ({ t, v: t / 10 }));
  const series = { A: points(0, 10, 20, 30, 40), B: points(5, 25), C: [] };

  it("deja los puntos con t en [desde, hasta], extremos incluidos", () => {
    const sliced = sliceSeries(series, 10, 30);
    expect(sliced.A.map((p) => p.t)).toEqual([10, 20, 30]);
    expect(sliced.B.map((p) => p.t)).toEqual([25]);
    expect(sliced.C).toEqual([]);
  });

  it("del inicio de la ventana al cursor, como video", () => {
    expect(sliceSeries(series, 0, 12).A.map((p) => p.t)).toEqual([0, 10]);
    expect(sliceSeries(series, 0, -1).A).toEqual([]);
  });

  it("una serie que cabe entera no se copia", () => {
    expect(sliceSeries(series, -100, 100).A).toBe(series.A);
  });

  it("la ultima muestra visible es la mas reciente entre las series", () => {
    expect(lastPointAt(sliceSeries(series, 0, 27))).toBe(25);
    expect(lastPointAt({ A: [], B: [] })).toBeNull();
  });
});

describe("teclado de los controles deslizantes", () => {
  const bounds = { min: 0, max: 100, step: 1 };

  it("flechas, Re Pag / Av Pag, Inicio y Fin", () => {
    expect(sliderKeyValue("ArrowRight", 50, bounds)).toBe(51);
    expect(sliderKeyValue("ArrowUp", 50, bounds)).toBe(51);
    expect(sliderKeyValue("ArrowLeft", 50, bounds)).toBe(49);
    expect(sliderKeyValue("ArrowDown", 50, bounds)).toBe(49);
    expect(sliderKeyValue("PageUp", 50, bounds)).toBe(60);
    expect(sliderKeyValue("PageDown", 50, bounds)).toBe(40);
    expect(sliderKeyValue("Home", 50, bounds)).toBe(0);
    expect(sliderKeyValue("End", 50, bounds)).toBe(100);
  });

  it("no se pasa de los extremos", () => {
    expect(sliderKeyValue("PageUp", 95, bounds)).toBe(100);
    expect(sliderKeyValue("ArrowLeft", 0, bounds)).toBe(0);
  });

  it("otras teclas no son del control", () => {
    expect(sliderKeyValue("Tab", 50, bounds)).toBeNull();
    expect(sliderKeyValue("a", 50, bounds)).toBeNull();
  });

  it("el paso crece con la duracion", () => {
    expect(sliderStep(10)).toBe(1);
    expect(sliderStep(600)).toBe(1);
    expect(sliderStep(HOUR)).toBe(10);
    expect(sliderStep(2 * HOUR)).toBe(60);
  });
});

describe("posicion en el riel", () => {
  it("de una fraccion a un valor redondeado al paso", () => {
    expect(valueAtFraction(0.5, 0, 7500, 60)).toBe(3780);
    expect(valueAtFraction(-1, 0, 7500, 60)).toBe(0);
    expect(valueAtFraction(2, 0, 7500, 60)).toBe(7500);
  });

  it("cerca del final da el final aunque no sea multiplo del paso", () => {
    expect(valueAtFraction(1, 0, 301.057, 1)).toBe(301.057);
    expect(valueAtFraction(0.9999, 0, 301.057, 1)).toBe(301.057);
    expect(valueAtFraction(0.99, 0, 301.057, 1)).toBe(298);
  });

  it("de un valor a %", () => {
    expect(percentOf(25, 0, 100)).toBe(25);
    expect(percentOf(150, 0, 100)).toBe(100);
    expect(percentOf(5, 0, 0)).toBe(0);
  });

  it("marcas en el inicio, los cuartos y el fin", () => {
    expect(rangeTicks(7500)).toEqual([0, 1875, 3750, 5625, 7500]);
  });
});

describe("textos de la ventana", () => {
  it("muestras de la ventana en proporcion a su ancho", () => {
    expect(windowSampleCount({ start: 0, end: 7500 }, 7500, 7500)).toBe(7500);
    expect(windowSampleCount({ start: 600, end: 1200 }, 7500, 7500)).toBe(600);
    expect(windowSampleCount({ start: 0, end: 0 }, 0, 3)).toBe(3);
  });

  it("minutos con un decimal en el idioma de la pantalla", () => {
    expect(formatMinutes(150, "es")).toBe("2,5");
    expect(formatMinutes(150, "en")).toBe("2.5");
    expect(formatMinutes(7500, "es")).toBe("125");
  });

  it("los campos Inicio y Fin usan punto y hasta 2 decimales", () => {
    expect(minutesFieldValue(7500)).toBe("125");
    expect(minutesFieldValue(10.5)).toBe("0.18");
    expect(parseMinutesField("2.5")).toBe(150);
    expect(parseMinutesField("2,5")).toBe(150);
    expect(parseMinutesField("")).toBeNaN();
    expect(parseMinutesField("abc")).toBeNaN();
  });
});
