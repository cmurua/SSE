// Se renderiza a HTML con react-dom/server, como ControlBarsPanel: el
// proyecto no tiene jsdom. La respuesta del backend se carga de antemano en
// la cache de TanStack Query con la misma key que usa la pagina, asi que no
// hay red. Armar la query desde la URL y paginar se prueban en
// listFilters.test.ts.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import "@/i18n";
import type { OperationListItem, OperationPage } from "@/types/operation";
import { operationsListKey } from "../hooks/useOperationsList";
import { parseListParams } from "../services/listFilters";
import { HistoricalsPage, OperationsResults, type OperationsResultsProps } from "./HistoricalsPage";

function operation(n: number, overrides: Partial<OperationListItem> = {}): OperationListItem {
  return {
    id: `OP-2026-${String(n).padStart(3, "0")}`,
    name: `Operacion ${n}`,
    started_at: "2026-04-10T01:30:00Z",
    ended_at: "2026-04-10T03:35:00Z",
    operator: "M. Gomez",
    duration_minutes: 125,
    notes: `Notas ${n}`,
    sample_count: 7500,
    ...overrides,
  };
}

/** Renderiza la pagina en `url` con la respuesta `page` ya en la cache (o
 *  sin nada, si es undefined: el estado "cargando"). */
function renderPage(url: string, page?: OperationPage) {
  const client = new QueryClient();
  if (page) {
    const search = new URLSearchParams(url.split("?")[1] ?? "");
    client.setQueryData(operationsListKey(parseListParams(search)), page);
  }
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <HistoricalsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderResults(props: Partial<OperationsResultsProps>) {
  const noop = () => {};
  return renderToStaticMarkup(
    <MemoryRouter>
      <OperationsResults
        status="ready"
        updating={false}
        filtersActive={false}
        listSearch=""
        onRetry={noop}
        onPageChange={noop}
        onClearFilters={noop}
        {...props}
      />
    </MemoryRouter>,
  );
}

const text = (html: string) => html.replace(/<[^>]+>/g, "");
const rows = (html: string) => [...html.matchAll(/data-operation="([^"]+)"/g)].map((m) => m[1]);
const pageButtons = (html: string) =>
  [...html.matchAll(/data-page="(\d+)"/g)].map((m) => Number(m[1]));

describe("HistoricalsPage", () => {
  it("muestra el estado vacio con los filtros aplicados y ofrece limpiarlos", () => {
    const html = renderPage("/historicals?q=zzz", { items: [], total: 0, page: 1, page_size: 20 });
    expect(html).toContain('data-state="empty"');
    expect(text(html)).toContain("No hay operaciones que coincidan con los filtros.");
    expect(text(html)).toContain("Limpiar filtros");
    expect(text(html)).toContain("No hay operaciones para mostrar.");
    expect(rows(html)).toEqual([]);
  });

  it("sin filtros y sin operaciones no habla de filtros", () => {
    const html = renderPage("/historicals", { items: [], total: 0, page: 1, page_size: 20 });
    expect(text(html)).toContain("Todavia no hay operaciones registradas.");
    expect(text(html)).not.toContain("Limpiar filtros");
  });

  it("carga los filtros de la URL en el panel", () => {
    const html = renderPage("/historicals?from=2026-03-01&to=2026-04-30&q=Pulso", {
      items: [operation(1)],
      total: 1,
      page: 1,
      page_size: 20,
    });
    expect(html).toMatch(/name="from"[^>]*value="2026-03-01"/);
    expect(html).toMatch(/name="to"[^>]*value="2026-04-30"/);
    expect(html).toMatch(/name="q"[^>]*value="Pulso"/);
  });

  it("muestra las filas, el contador y la paginacion de la pagina pedida", () => {
    const items = Array.from({ length: 20 }, (_, i) => operation(21 + i));
    const html = renderPage("/historicals?page=2", { items, total: 45, page: 2, page_size: 20 });

    expect(rows(html)).toHaveLength(20);
    expect(rows(html)[0]).toBe("OP-2026-021");
    expect(text(html)).toContain("Mostrando 21-40 de 45 operaciones.");
    expect(text(html)).toContain("Pagina 2 de 3");
    expect(pageButtons(html)).toEqual([1, 2, 3]);
    expect(html).toMatch(/data-page="2"[^>]*aria-current="page"/);
  });

  it("mientras llega la primera respuesta muestra el estado cargando", () => {
    const html = renderPage("/historicals");
    expect(html).toContain('data-state="loading"');
    expect(text(html)).toContain("Buscando operaciones...");
    expect(html).not.toContain("Pagina ");
  });
});

describe("OperationsResults", () => {
  const page: OperationPage = { items: [operation(7)], total: 1, page: 1, page_size: 20 };

  it("cada fila muestra id, nombre, notas, fecha en Cordoba, duracion, operador y muestras", () => {
    const html = text(renderResults({ data: page }));
    for (const value of ["OP-2026-007", "Operacion 7", "Notas 7", "2026-04-09", "22:30", "2h 05m"]) {
      expect(html).toContain(value);
    }
    expect(html).toContain("M. Gomez");
    expect(html).toContain("7.500");
  });

  it("el boton de cada fila lleva al detalle de esa operacion", () => {
    const html = renderResults({ data: page });
    expect(html).toContain('href="/historicals/OP-2026-007"');
    expect(text(html)).toContain("Ir a la operacion");
  });

  it("sin notas no deja una linea vacia", () => {
    const html = renderResults({ data: { ...page, items: [operation(7, { notes: null })] } });
    expect(html).not.toContain("Notas");
  });

  it("con una sola pagina no muestra botones de paginacion", () => {
    const html = renderResults({ data: page });
    expect(text(html)).toContain("Pagina 1 de 1");
    expect(pageButtons(html)).toEqual([]);
  });

  it("resume las paginas lejanas", () => {
    const html = renderResults({
      data: { items: [operation(1)], total: 200, page: 5, page_size: 20 },
    });
    expect(pageButtons(html)).toEqual([1, 4, 5, 6, 10]);
    expect(html).toContain("…");
  });

  it("si falla muestra el error con un boton para reintentar", () => {
    const html = renderResults({ status: "error" });
    expect(html).toContain('role="alert"');
    expect(text(html)).toContain("No se pudo cargar el listado de operaciones.");
    expect(text(html)).toContain("Reintentar");
    expect(rows(html)).toEqual([]);
  });

  it("una pagina que ya no existe no se muestra como vacia", () => {
    const html = renderResults({ data: { items: [], total: 45, page: 9, page_size: 20 } });
    expect(html).toContain('data-state="loading"');
    expect(html).not.toContain('data-state="empty"');
  });

  it("mientras llega otra pagina avisa que se esta actualizando", () => {
    const html = renderResults({ data: page, updating: true });
    expect(text(html)).toContain("Actualizando...");
    expect(html).toContain('aria-busy="true"');
  });
});
