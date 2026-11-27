import { describe, expect, it } from "vitest";
import { ApiError } from "@/services/api/httpClient";
import type { ReactorVariable } from "@/types/reactor";
import { toOperationSeries } from "../hooks/useOperationSamples";
import { MAX_SAMPLE_VARIABLES } from "./historicalsApi";
import {
  backToListHref,
  detailScreen,
  formatBucketSeconds,
  samplesVariableIds,
} from "./operationDetail";

function variable(id: string, group: string): ReactorVariable {
  return { id, name: id, unit: "%", group, group_name: group, min: 0, max: 100, nominal: 50, kind: "medida" };
}

const bars = (count: number) => Array.from({ length: count }, (_, i) => variable(`POSBC${i + 1}`, "SBC"));
const CATALOG = [variable("POTM4", "SSO"), variable("REACTM4", "SSO"), ...bars(4), variable("NN1", "SCM")];

describe("backToListHref", () => {
  it("vuelve al listado con los filtros y la pagina que dejo el listado", () => {
    expect(backToListHref({ listSearch: "?q=OP&page=2" })).toBe("/historicals?q=OP&page=2");
  });

  it("sin filtros, o sin estado (link directo), vuelve al listado sin filtros", () => {
    expect(backToListHref({ listSearch: "" })).toBe("/historicals");
    expect(backToListHref(null)).toBe("/historicals");
    expect(backToListHref(undefined)).toBe("/historicals");
  });

  it("ignora un estado que no es una query", () => {
    expect(backToListHref({ listSearch: "//otro.sitio" })).toBe("/historicals");
    expect(backToListHref({ listSearch: 5 })).toBe("/historicals");
    expect(backToListHref("?q=OP")).toBe("/historicals");
  });
});

describe("detailScreen", () => {
  const base = { isPending: false, isError: false, isFetching: false, error: null };

  it("un 404 es 'la operacion no existe' (no existe o sigue abierta)", () => {
    expect(detailScreen({ ...base, isError: true, error: new ApiError(404, null) })).toBe("notFound");
  });

  it("cualquier otro error se puede reintentar", () => {
    expect(detailScreen({ ...base, isError: true, error: new ApiError(500, null) })).toBe("error");
    expect(detailScreen({ ...base, isError: true, error: new TypeError("Failed to fetch") })).toBe(
      "error",
    );
  });

  it("al reintentar despues de un error muestra que esta cargando", () => {
    const retrying = { ...base, isError: true, isFetching: true, error: new ApiError(500, null) };
    expect(detailScreen(retrying)).toBe("loading");
  });

  it("mientras carga y cuando llego", () => {
    expect(detailScreen({ ...base, isPending: true })).toBe("loading");
    expect(detailScreen(base)).toBe("ready");
  });
});

describe("samplesVariableIds", () => {
  it("pide las elegidas y despues las del panel del nucleo", () => {
    expect(samplesVariableIds(["REACTM4", "POTM4"], CATALOG)).toEqual([
      "REACTM4",
      "POTM4",
      "POSBC1",
      "POSBC2",
      "POSBC3",
      "POSBC4",
      "NN1",
    ]);
  });

  it("no repite una variable del panel que tambien esta elegida", () => {
    expect(samplesVariableIds(["POSBC2"], CATALOG)).toEqual([
      "POSBC2",
      "POSBC1",
      "POSBC3",
      "POSBC4",
      "NN1",
    ]);
  });

  it("sin catalogo pide solo las elegidas", () => {
    expect(samplesVariableIds(["POTM4"], undefined)).toEqual(["POTM4"]);
  });

  it("con un panel mas grande que el tope recorta el panel y nunca las elegidas", () => {
    const big = [...CATALOG.filter((v) => v.group !== "SBC"), ...bars(10)];
    const ids = samplesVariableIds(["POTM4", "REACTM4"], big);
    expect(ids).toHaveLength(MAX_SAMPLE_VARIABLES);
    expect(ids.slice(0, 2)).toEqual(["POTM4", "REACTM4"]);
  });
});

describe("formatBucketSeconds", () => {
  it("usa como mucho un decimal, con la coma o el punto del idioma", () => {
    expect(formatBucketSeconds(5.4321, "es")).toBe("5,4");
    expect(formatBucketSeconds(5.4321, "en")).toBe("5.4");
    expect(formatBucketSeconds(6, "es")).toBe("6");
  });
});

describe("toOperationSeries", () => {
  it("arma las series de las variables de la respuesta y dice si estan reducidas", () => {
    const result = toOperationSeries({
      operation_id: "OP-1",
      variables: ["A", "B"],
      start: 0,
      end: 10,
      downsampled: true,
      bucket_seconds: 5,
      samples: [
        { operation_id: "OP-1", timestamp: "2026-11-18T12:00:00Z", values: { A: 1, B: null } },
        { operation_id: "OP-1", timestamp: "2026-11-18T12:00:05Z", values: { A: 2, B: 3 } },
      ],
    });
    const t0 = Date.parse("2026-11-18T12:00:00Z");
    expect(result.series).toEqual({
      A: [
        { t: t0, v: 1 },
        { t: t0 + 5000, v: 2 },
      ],
      B: [{ t: t0 + 5000, v: 3 }],
    });
    expect(result.lastSampleAt).toBe(t0 + 5000);
    expect(result.downsampled).toBe(true);
    expect(result.bucketSeconds).toBe(5);
  });
});
