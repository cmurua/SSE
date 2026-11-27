import { describe, expect, it } from "vitest";
import { stripColumns } from "./OperationStrip";

describe("stripColumns", () => {
  it("una columna por casillero, mas ancha la de los casilleros wide", () => {
    expect(stripColumns([{ wide: true }, {}, {}])).toBe("1.4fr 1fr 1fr");
  });

  it("los 5 casilleros de Tiempo Real quedan como antes del refactor (1.4fr repeat(4,1fr))", () => {
    expect(stripColumns([{ wide: true }, {}, {}, {}, {}])).toBe("1.4fr 1fr 1fr 1fr 1fr");
  });
});
