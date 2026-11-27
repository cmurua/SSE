import { describe, expect, it } from "vitest";
import { MOCK_VARIABLES } from "@/mocks/variables.mock";
import {
  canSelect,
  DEFAULT_SELECTION,
  formatBound,
  formatRange,
  groupVariables,
  MAX_SELECTED_VARIABLES,
  toggleVariable,
} from "./variableSelection";

describe("toggleVariable", () => {
  it("agrega en orden de eleccion: la primera es la Variable A", () => {
    expect(toggleVariable([], "POTM4")).toEqual(["POTM4"]);
    expect(toggleVariable(["POTM4"], "LOGA1")).toEqual(["POTM4", "LOGA1"]);
  });

  it("no acepta una tercera variable ni desplaza a las elegidas (RF05)", () => {
    expect(MAX_SELECTED_VARIABLES).toBe(2);
    expect(toggleVariable(["POTM4", "LOGA1"], "MASC")).toEqual(["POTM4", "LOGA1"]);
  });

  it("quita una elegida; al quitar la A, la B pasa a ser la A", () => {
    expect(toggleVariable(["POTM4", "LOGA1"], "POTM4")).toEqual(["LOGA1"]);
    expect(toggleVariable(["POTM4"], "POTM4")).toEqual([]);
  });

  it("con el tope alcanzado se puede quitar una y elegir otra", () => {
    const freed = toggleVariable(["POTM4", "LOGA1"], "LOGA1");
    expect(toggleVariable(freed, "MASC")).toEqual(["POTM4", "MASC"]);
  });

  it("no modifica la seleccion recibida", () => {
    const selection = ["POTM4"];
    toggleVariable(selection, "LOGA1");
    expect(selection).toEqual(["POTM4"]);
  });
});

describe("canSelect", () => {
  it("solo con lugar libre y si no esta elegida", () => {
    expect(canSelect([], "POTM4")).toBe(true);
    expect(canSelect(["POTM4"], "POTM4")).toBe(false);
    expect(canSelect(["POTM4", "LOGA1"], "MASC")).toBe(false);
  });
});

describe("DEFAULT_SELECTION", () => {
  it("arranca con la potencia, que existe en el catalogo, y deja lugar para otra", () => {
    expect(DEFAULT_SELECTION).toEqual(["POTM4"]);
    expect(DEFAULT_SELECTION.length).toBeLessThan(MAX_SELECTED_VARIABLES);
  });
});

describe("groupVariables", () => {
  it("agrupa por subsistema en el orden del catalogo", () => {
    const groups = groupVariables(MOCK_VARIABLES);
    expect(groups.map((g) => g.code)).toEqual(["SA1", "SMA", "SSO"]);
    expect(groups[1]).toMatchObject({ name: "Monitores de Area" });
    expect(groups[1].variables.map((v) => v.id)).toEqual(["MASC", "NDSC"]);
  });

  it("filtra por nombre, ID o grupo, sin importar mayusculas ni tildes", () => {
    const ids = (query: string) =>
      groupVariables(MOCK_VARIABLES, query).flatMap((g) => g.variables.map((v) => v.id));
    expect(ids("logarítmico")).toEqual(["LOGA1"]);
    expect(ids("potm4")).toEqual(["POTM4"]);
    expect(ids("sma")).toEqual(["MASC", "NDSC"]);
    expect(ids("  supervision ")).toEqual(["REACTM4", "POTM4"]);
  });

  it("omite los grupos sin coincidencias", () => {
    expect(groupVariables(MOCK_VARIABLES, "no existe")).toEqual([]);
  });
});

describe("formatBound / formatRange", () => {
  it("usa notacion cientifica solo para magnitudes muy grandes o muy chicas", () => {
    expect(formatBound(1e5)).toBe("1e5");
    expect(formatBound(1e-3)).toBe("1e-3");
    expect(formatBound(2.5e4)).toBe("2.5e4");
    expect(formatBound(0)).toBe("0");
    expect(formatBound(-300)).toBe("-300");
    expect(formatBound(10)).toBe("10");
    expect(formatBound(1.5)).toBe("1.5");
  });

  it("arma el rango con la unidad", () => {
    expect(formatRange({ min: 1, max: 1e5, unit: "c/s" })).toBe("[1, 1e5] c/s");
    expect(formatRange({ min: 0, max: 10, unit: "W" })).toBe("[0, 10] W");
  });
});
