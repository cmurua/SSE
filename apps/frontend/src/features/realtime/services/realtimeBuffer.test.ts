import { describe, expect, it } from "vitest";
import type { RealtimeSample } from "@/types/realtime";
import {
  appendSample,
  EMPTY_BUFFER,
  forOperation,
  REALTIME_WINDOW_POINTS,
  retainVariables,
} from "./realtimeBuffer";

const T0 = Date.parse("2026-11-18T12:00:00Z");

function sample(
  second: number,
  values: RealtimeSample["values"],
  operation_id = "OP-1",
): RealtimeSample {
  return { operation_id, timestamp: new Date(T0 + second * 1000).toISOString(), values };
}

describe("appendSample", () => {
  it("agrega un punto por variable con el timestamp del servidor", () => {
    const buffer = appendSample(EMPTY_BUFFER, sample(0, { A: 1, B: 2 }), ["A", "B"]);
    expect(buffer.operationId).toBe("OP-1");
    expect(buffer.series).toEqual({ A: [{ t: T0, v: 1 }], B: [{ t: T0, v: 2 }] });
    expect(buffer.lastSampleAt).toBe(T0);
  });

  it("acepta timestamps con microsegundos, como los manda el backend", () => {
    const s = { operation_id: "OP-1", timestamp: "2026-11-18T12:00:00.512000Z", values: { A: 1 } };
    expect(appendSample(EMPTY_BUFFER, s, ["A"]).series.A[0].t).toBe(T0 + 512);
  });

  it("no crece mas alla de la ventana: descarta los puntos mas viejos", () => {
    let buffer = EMPTY_BUFFER;
    for (let i = 0; i < REALTIME_WINDOW_POINTS + 50; i++) {
      buffer = appendSample(buffer, sample(i, { A: i }), ["A"]);
    }
    expect(buffer.series.A).toHaveLength(REALTIME_WINDOW_POINTS);
    expect(buffer.series.A[0].v).toBe(50);
    expect(buffer.series.A.at(-1)?.v).toBe(REALTIME_WINDOW_POINTS + 49);
  });

  it("no guarda un null como punto: no es un 0 medido", () => {
    const buffer = appendSample(EMPTY_BUFFER, sample(0, { A: null, B: 0 }), ["A", "B"]);
    expect(buffer.series.A).toBeUndefined();
    expect(buffer.series.B).toEqual([{ t: T0, v: 0 }]);
  });

  it("ignora variables que ya no estan en la seleccion", () => {
    const buffer = appendSample(EMPTY_BUFFER, sample(0, { A: 1, B: 2 }), ["A"]);
    expect(Object.keys(buffer.series)).toEqual(["A"]);
  });

  it("descarta una muestra repetida o desordenada", () => {
    let buffer = appendSample(EMPTY_BUFFER, sample(5, { A: 5 }), ["A"]);
    buffer = appendSample(buffer, sample(5, { A: 99 }), ["A"]);
    buffer = appendSample(buffer, sample(3, { A: 3 }), ["A"]);
    expect(buffer.series.A).toEqual([{ t: T0 + 5000, v: 5 }]);
  });

  it("empieza de cero si la muestra es de otra operacion", () => {
    let buffer = appendSample(EMPTY_BUFFER, sample(0, { A: 1 }), ["A"]);
    buffer = appendSample(buffer, sample(1, { A: 2 }, "OP-2"), ["A"]);
    expect(buffer.operationId).toBe("OP-2");
    expect(buffer.series.A).toEqual([{ t: T0 + 1000, v: 2 }]);
  });

  it("no modifica el buffer anterior", () => {
    const before = appendSample(EMPTY_BUFFER, sample(0, { A: 1 }), ["A"]);
    const seriesBefore = before.series.A;
    appendSample(before, sample(1, { A: 2 }), ["A"]);
    expect(before.series.A).toBe(seriesBefore);
    expect(seriesBefore).toHaveLength(1);
  });
});

describe("forOperation", () => {
  it("conserva el buffer de la misma operacion y vacia el de otra", () => {
    const buffer = appendSample(EMPTY_BUFFER, sample(0, { A: 1 }), ["A"]);
    expect(forOperation(buffer, "OP-1")).toBe(buffer);
    expect(forOperation(buffer, "OP-2")).toEqual({ ...EMPTY_BUFFER, operationId: "OP-2" });
  });
});

describe("retainVariables", () => {
  it("conserva las series que siguen elegidas y quita las demas", () => {
    const buffer = appendSample(EMPTY_BUFFER, sample(0, { A: 1, B: 2 }), ["A", "B"]);
    const next = retainVariables(buffer, ["B", "C"]);
    expect(next.series).toEqual({ B: buffer.series.B });
    expect(next.series.B).toBe(buffer.series.B);
  });

  it("devuelve el mismo buffer si no hay nada que quitar", () => {
    const buffer = appendSample(EMPTY_BUFFER, sample(0, { A: 1 }), ["A"]);
    expect(retainVariables(buffer, ["A", "B"])).toBe(buffer);
  });
});
