// Mismos casos que apps/backend/tests/domains/exports/test_file_names.py: el
// CSV lo nombra el backend y el PNG el frontend, con la misma convencion.
import { describe, expect, it } from "vitest";
import { exportFileName, formatOffset } from "./exportFileName";

describe("formatOffset", () => {
  it.each([
    [0, "00h00m00s"],
    [59, "00h00m59s"],
    [300, "00h05m00s"],
    [5400, "01h30m00s"],
    [3600 * 100 + 1, "100h00m01s"],
    [-5, "00h00m00s"],
  ])("%s s -> %s", (seconds, expected) => {
    expect(formatOffset(seconds)).toBe(expected);
  });
});

describe("exportFileName", () => {
  it("lleva operacion, variables y ventana", () => {
    expect(
      exportFileName({
        operationId: "OP-2025-001",
        variableIds: ["LOGA1", "POTM4"],
        window: { start: 300, end: 5400 },
        extension: "csv",
      }),
    ).toBe("SSE_OP-2025-001_LOGA1-POTM4_00h05m00s-01h30m00s.csv");
  });

  it("redondea el inicio hacia abajo y el fin hacia arriba", () => {
    expect(
      exportFileName({
        operationId: "OP-1",
        variableIds: ["POTM4"],
        window: { start: 59.9, end: 60.1 },
        extension: "png",
      }),
    ).toBe("SSE_OP-1_POTM4_00h00m59s-00h01m01s.png");
  });

  it("todas las variables", () => {
    expect(
      exportFileName({
        operationId: "OP-1",
        variableIds: [],
        allVariables: true,
        window: { start: 0, end: 60 },
        extension: "csv",
      }),
    ).toBe("SSE_OP-1_todas_00h00m00s-00h01m00s.csv");
  });

  it("sin ventana no lleva el campo", () => {
    expect(
      exportFileName({ operationId: "OP-1", variableIds: ["POTM4"], window: null, extension: "png" }),
    ).toBe("SSE_OP-1_POTM4.png");
  });

  it.each([
    ["OP 2025/001", "OP-2025-001"],
    ["op_1:a", "op-1-a"],
    ["Práctica#3", "Pr-ctica-3"],
    ["--x--", "x"],
    ["///", "sin-id"],
    [null, "sin-id"],
  ])("la operacion %s queda como %s", (operationId, expected) => {
    expect(
      exportFileName({ operationId, variableIds: ["POTM4"], window: null, extension: "png" }),
    ).toBe(`SSE_${expected}_POTM4.png`);
  });
});
