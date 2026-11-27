import { describe, expect, it } from "vitest";
import {
  EMPTY_FILTERS,
  MAX_QUERY_LENGTH,
  formatDuration,
  formatOperationStart,
  hasActiveFilters,
  pageCount,
  pageRange,
  pageToRedirect,
  parseListParams,
  shownRange,
  toApiParams,
  toSearchParams,
} from "./listFilters";

const parse = (search: string) => parseListParams(new URLSearchParams(search));

describe("parseListParams", () => {
  it("sin parametros no filtra y abre la pagina 1", () => {
    expect(parse("")).toEqual(EMPTY_FILTERS);
  });

  it("lee los filtros y la pagina de la URL", () => {
    expect(parse("?from=2026-03-01&to=2026-04-30&q=OP-2026&page=3")).toEqual({
      from: "2026-03-01",
      to: "2026-04-30",
      q: "OP-2026",
      page: 3,
    });
  });

  it("descarta las fechas que no son un dia", () => {
    expect(parse("?from=2026-02-30&to=ayer").from).toBeNull();
    expect(parse("?from=2026-02-30&to=ayer").to).toBeNull();
    expect(parse("?from=2026-13-01").from).toBeNull();
    expect(parse("?from=2026-3-1").from).toBeNull();
    expect(parse("?from=2024-02-29").from).toBe("2024-02-29");
  });

  it("descarta el rango entero si from es posterior a to (el backend daria 422)", () => {
    const filters = parse("?from=2026-05-01&to=2026-04-01&q=x");
    expect(filters.from).toBeNull();
    expect(filters.to).toBeNull();
    expect(filters.q).toBe("x");
  });

  it("acepta un rango de un solo dia", () => {
    expect(parse("?from=2026-04-01&to=2026-04-01").from).toBe("2026-04-01");
  });

  it("una pagina invalida vuelve a la 1", () => {
    for (const page of ["0", "-2", "abc", "1.5", "", "99999999999999999999"]) {
      expect(parse(`?page=${page}`).page).toBe(1);
    }
  });

  it("normaliza el texto: recorta espacios, quita NUL y respeta el largo maximo", () => {
    expect(parse("?q=%20%20OP-1%20").q).toBe("OP-1");
    expect(parse("?q=%20%20%20").q).toBeNull();
    expect(parse("?q=OP%00-1").q).toBe("OP-1");
    expect(parse(`?q=${"a".repeat(150)}`).q).toHaveLength(MAX_QUERY_LENGTH);
  });
});

describe("toSearchParams", () => {
  it("es el camino inverso de parseListParams", () => {
    const search = "from=2026-03-01&to=2026-04-30&q=Pulso+de+potencia&page=2";
    expect(toSearchParams(parse(search)).toString()).toBe(search);
  });

  it("no escribe los filtros vacios ni la pagina 1", () => {
    expect(toSearchParams(EMPTY_FILTERS).toString()).toBe("");
    expect(toSearchParams({ ...EMPTY_FILTERS, q: "OP" }).toString()).toBe("q=OP");
  });
});

describe("toApiParams", () => {
  it("arma la query del backend con sus nombres (q, no operationId)", () => {
    expect(
      toApiParams({ from: "2026-03-01", to: "2026-04-30", q: "OP-2026", page: 2 }),
    ).toEqual({ from: "2026-03-01", to: "2026-04-30", q: "OP-2026", page: 2 });
  });

  it("no manda los filtros vacios", () => {
    const params = toApiParams(EMPTY_FILTERS);
    expect(params).toEqual({ from: undefined, to: undefined, q: undefined, page: 1 });
  });
});

describe("hasActiveFilters", () => {
  it("la pagina no cuenta como filtro", () => {
    expect(hasActiveFilters({ ...EMPTY_FILTERS, page: 4 })).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, to: "2026-01-01" })).toBe(true);
  });
});

describe("paginacion", () => {
  it("calcula la cantidad de paginas con el total y el tamano de la respuesta", () => {
    expect(pageCount(0, 20)).toBe(0);
    expect(pageCount(1, 20)).toBe(1);
    expect(pageCount(20, 20)).toBe(1);
    expect(pageCount(21, 20)).toBe(2);
    expect(pageCount(200, 20)).toBe(10);
  });

  it("muestra todas las paginas cuando son pocas", () => {
    expect(pageRange(1, 1)).toEqual([1]);
    expect(pageRange(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("resume las lejanas con un hueco, y no deja un hueco de una sola pagina", () => {
    expect(pageRange(1, 10)).toEqual([1, 2, "gap", 10]);
    expect(pageRange(5, 10)).toEqual([1, "gap", 4, 5, 6, "gap", 10]);
    expect(pageRange(10, 10)).toEqual([1, "gap", 9, 10]);
    // De 1 a 3 falta solo el 2: se muestra el 2, no "…".
    expect(pageRange(4, 10)).toEqual([1, 2, 3, 4, 5, "gap", 10]);
  });

  it("sin paginas no hay botones", () => {
    expect(pageRange(1, 0)).toEqual([]);
  });

  it("ubica la pagina dentro del total", () => {
    expect(shownRange(1, 20, 20)).toEqual({ first: 1, last: 20 });
    expect(shownRange(2, 20, 20)).toEqual({ first: 21, last: 40 });
    expect(shownRange(7, 20, 17)).toEqual({ first: 121, last: 137 });
    expect(shownRange(1, 20, 0)).toBeNull();
  });

  it("lleva a la ultima pagina si se pidio una que no existe", () => {
    expect(pageToRedirect(99, 137, 20)).toBe(7);
    expect(pageToRedirect(7, 137, 20)).toBeNull();
    // Sin operaciones es el estado vacio, no una redireccion.
    expect(pageToRedirect(3, 0, 20)).toBeNull();
  });
});

describe("formatos", () => {
  it("muestra el inicio en hora de Cordoba, igual que el filtro por dia del backend", () => {
    // 01:30 UTC del 10 = 22:30 del 9 en Cordoba: aparece al filtrar por el 9.
    expect(formatOperationStart("2026-04-10T01:30:00Z")).toEqual({
      day: "2026-04-09",
      time: "22:30",
    });
    expect(formatOperationStart("2026-04-10T12:05:00+00:00")).toEqual({
      day: "2026-04-10",
      time: "09:05",
    });
  });

  it("formatea la duracion como el prototipo", () => {
    expect(formatDuration(0)).toBe("0h 00m");
    expect(formatDuration(125)).toBe("2h 05m");
    expect(formatDuration(null)).toBe("—");
  });
});
