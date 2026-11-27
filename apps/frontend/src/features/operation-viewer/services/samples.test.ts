import { describe, expect, it } from "vitest";
import type { RealtimeSample } from "@/types/realtime";
import { parseTimestamp, samplesToSeries } from "./samples";

const T0 = Date.parse("2026-11-18T12:00:00Z");

function sample(second: number, values: RealtimeSample["values"]): RealtimeSample {
  return { operation_id: "OP-1", timestamp: new Date(T0 + second * 1000).toISOString(), values };
}

describe("parseTimestamp", () => {
  it("recorta a milisegundos y acepta un timestamp sin decimales", () => {
    expect(parseTimestamp("2026-11-18T12:00:00.512999Z")).toBe(T0 + 512);
    expect(parseTimestamp("2026-11-18T12:00:00Z")).toBe(T0);
  });
});

describe("samplesToSeries", () => {
  it("arma un punto por variable y muestra, con el timestamp del backend", () => {
    const result = samplesToSeries([sample(0, { A: 1, B: 2 }), sample(1, { A: 3, B: 4 })], ["A", "B"]);
    expect(result.series).toEqual({
      A: [
        { t: T0, v: 1 },
        { t: T0 + 1000, v: 3 },
      ],
      B: [
        { t: T0, v: 2 },
        { t: T0 + 1000, v: 4 },
      ],
    });
    expect(result.lastSampleAt).toBe(T0 + 1000);
  });

  it("no guarda los null pero la muestra cuenta como la ultima", () => {
    const result = samplesToSeries([sample(0, { A: 1 }), sample(1, { A: null })], ["A"]);
    expect(result.series.A).toEqual([{ t: T0, v: 1 }]);
    expect(result.lastSampleAt).toBe(T0 + 1000);
  });

  it("solo arma las variables pedidas y deja vacias las que no vinieron", () => {
    const result = samplesToSeries([sample(0, { A: 1, X: 9 })], ["A", "B"]);
    expect(result.series).toEqual({ A: [{ t: T0, v: 1 }], B: [] });
  });

  it("descarta muestras repetidas, desordenadas o con timestamp invalido", () => {
    const bad = { operation_id: "OP-1", timestamp: "no es una fecha", values: { A: 7 } };
    const result = samplesToSeries(
      [sample(1, { A: 1 }), sample(0, { A: 2 }), sample(1, { A: 3 }), bad],
      ["A"],
    );
    expect(result.series.A).toEqual([{ t: T0 + 1000, v: 1 }]);
    expect(result.lastSampleAt).toBe(T0 + 1000);
  });

  it("sin muestras no hay ultima muestra", () => {
    expect(samplesToSeries([], ["A"])).toEqual({ series: { A: [] }, lastSampleAt: null });
  });
});
