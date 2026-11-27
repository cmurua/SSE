// Se renderiza a HTML con react-dom/server, como HistoricalsPage: el proyecto
// no tiene jsdom. El catalogo, el detalle y las series se cargan de antemano
// en la cache de TanStack Query con las mismas keys que usa la pagina, asi
// que no hay red. Los estados de error (404 incluido) se prueban sobre
// OperationDetailView, y su relacion con la respuesta en
// operationDetail.test.ts.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import "@/i18n";
import { VARIABLE_CATALOG_KEY } from "@/hooks/useVariableCatalog";
import { DEFAULT_SELECTION } from "@/features/operation-viewer/services/variableSelection";
import type { OperationDetail, OperationSamples } from "@/types/operation";
import type { ReactorVariable } from "@/types/reactor";
import type { RealtimeSample } from "@/types/realtime";
import { operationDetailKey } from "../hooks/useOperationDetail";
import { operationSamplesKey } from "../hooks/useOperationSamples";
import { samplesVariableIds } from "../services/operationDetail";
import { fullWindow, operationDurationSeconds } from "../services/playback";
import {
  OperationDetailPage,
  OperationDetailView,
  type OperationDetailViewProps,
} from "./OperationDetailPage";

const ID = "OP-2026-007";

function variable(id: string, name: string, group: string, unit = "%", max = 100): ReactorVariable {
  return { id, name, unit, group, group_name: group, min: 0, max, nominal: max / 2, kind: "medida" };
}

const CATALOG = [
  variable("POTM4", "Potencia", "SSO", "W", 10),
  ...[1, 2, 3, 4].map((n) => variable(`POSBC${n}`, `Posicion Barra de Control ${n}`, "SBC")),
  variable("NN1", "Nivel del Nucleo 1", "SCM"),
];

const DETAIL: OperationDetail = {
  id: ID,
  name: "Pulso de prueba",
  started_at: "2026-04-10T01:30:00Z",
  ended_at: "2026-04-10T03:35:00Z",
  operator: "M. Gomez",
  duration_minutes: 125,
  notes: "Calibracion del canal 2",
  sample_count: 7500,
  first_sample_at: "2026-04-10T01:30:00Z",
  last_sample_at: "2026-04-10T03:35:00Z",
};

const T0 = Date.parse("2026-04-10T01:30:00Z");

function sample(second: number, values: RealtimeSample["values"]): RealtimeSample {
  return { operation_id: ID, timestamp: new Date(T0 + second * 1000).toISOString(), values };
}

/** Respuesta de .../samples con las variables que pide la pagina al entrar. */
function samplesResponse(samples: RealtimeSample[], downsampled = false): OperationSamples {
  return {
    operation_id: ID,
    variables: samplesVariableIds(DEFAULT_SELECTION, CATALOG),
    start: 0,
    end: 7500,
    downsampled,
    bucket_seconds: downsampled ? 3.75 : null,
    samples,
  };
}

const FULL_SAMPLES = samplesResponse(
  [
    sample(0, { POTM4: 1.5, POSBC1: 10, POSBC2: 10, POSBC3: 10, POSBC4: 10, NN1: 99 }),
    sample(60, { POTM4: 4.25, POSBC1: 90, POSBC2: 60, POSBC3: 20, POSBC4: null, NN1: 70 }),
  ],
  true,
);

interface RenderOptions {
  state?: unknown;
  detail?: OperationDetail;
  samples?: OperationSamples;
  catalog?: ReactorVariable[];
}

function renderPage({ state, detail, samples, catalog = CATALOG }: RenderOptions = {}) {
  const client = new QueryClient();
  client.setQueryData(VARIABLE_CATALOG_KEY, catalog);
  if (detail) client.setQueryData(operationDetailKey(ID), detail);
  if (samples && detail) {
    // Al entrar se pide la operacion entera.
    client.setQueryData(
      operationSamplesKey(
        ID,
        samplesVariableIds(DEFAULT_SELECTION, catalog),
        fullWindow(operationDurationSeconds(detail)),
      ),
      samples,
    );
  }
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[{ pathname: `/historicals/${ID}`, state }]}>
        <Routes>
          <Route path="/historicals/:operationId" element={<OperationDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderView(props: Partial<OperationDetailViewProps>) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <OperationDetailView
        operationId={ID}
        backHref="/historicals?page=3"
        screen="ready"
        operation={undefined}
        onRetry={() => {}}
        {...props}
      />
    </MemoryRouter>,
  );
}

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const backHref = (html: string) => html.match(/href="([^"]*)"/)?.[1]?.replace(/&amp;/g, "&");
const barTones = (html: string) =>
  Object.fromEntries(
    [...html.matchAll(/data-variable="(POSBC\d)" data-tone="([^"]+)"/g)].map((m) => [m[1], m[2]]),
  );

describe("OperationDetailPage", () => {
  it("titula con el ID y el inicio en hora de Cordoba", () => {
    const html = renderPage({ detail: DETAIL, samples: FULL_SAMPLES });
    expect(text(html)).toContain(`Operacion ${ID} · 2026-04-09 22:30`);
  });

  it("'Volver al listado' conserva los filtros y la pagina del listado", () => {
    const html = renderPage({ state: { listSearch: "?q=Pulso&page=2" }, detail: DETAIL });
    expect(backHref(html)).toBe("/historicals?q=Pulso&page=2");
    expect(text(html)).toContain("Volver al listado");
  });

  it("entrando por un link directo vuelve al listado sin filtros", () => {
    expect(backHref(renderPage({ detail: DETAIL }))).toBe("/historicals");
  });

  it("muestra operacion, operador, duracion, muestras y notas", () => {
    const html = text(renderPage({ detail: DETAIL, samples: FULL_SAMPLES }));
    for (const value of ["Pulso de prueba", "M. Gomez", "2h 05m", "7.500", "Calibracion del canal 2"]) {
      expect(html).toContain(value);
    }
  });

  it("sin notas muestra un guion", () => {
    const html = renderPage({ detail: { ...DETAIL, notes: null }, samples: FULL_SAMPLES });
    expect(text(html)).toMatch(/Notas —/);
  });

  it("grafica la variable elegida con el mismo visor que Tiempo Real", () => {
    const html = renderPage({ detail: DETAIL, samples: FULL_SAMPLES });
    // Selector, modos, grafico, panel del nucleo y valor instantaneo.
    expect(text(html)).toContain("Variables");
    expect(text(html)).toContain("Variable vs. tiempo");
    expect(text(html)).toContain("Variable vs. variable");
    expect(html).toContain('role="img"');
    expect(html).toContain("Grafico de Potencia en funcion del tiempo");
    expect(text(html)).toContain("Nucleo del reactor");
    expect(text(html)).toContain("Valor instantaneo");
  });

  it("al entrar el cursor esta al final: valor instantaneo y panel del nucleo de la ultima muestra", () => {
    const html = renderPage({ detail: DETAIL, samples: FULL_SAMPLES });
    expect(text(html)).toContain("4.250 W");
    // POSBC4 no tuvo dato en la ultima muestra: sin dato, no la posicion vieja.
    expect(barTones(html)).toEqual({ POSBC1: "high", POSBC2: "mid", POSBC3: "low", POSBC4: "none" });
    expect(html).toMatch(/data-variable="NN1" data-status="critical"/);
  });

  it("las estadisticas son de toda la operacion y avisan si son promedios", () => {
    const html = text(renderPage({ detail: DETAIL, samples: FULL_SAMPLES }));
    expect(html).toContain("Min, promedio y max de toda la operacion, sobre promedios de 3,8 s");
    // Min y max de la operacion entera, no de una ventana.
    expect(html).toContain("1.500");
    expect(html).toContain("2.875");
  });

  it("sin reduccion no habla de promedios", () => {
    const samples = { ...FULL_SAMPLES, downsampled: false, bucket_seconds: null };
    const html = text(renderPage({ detail: DETAIL, samples }));
    expect(html).toContain("Min, promedio y max de toda la operacion");
    expect(html).not.toContain("sobre promedios");
  });

  it("muestra la ventana de analisis con la operacion entera", () => {
    const html = renderPage({ detail: DETAIL, samples: FULL_SAMPLES });
    expect(text(html)).toContain("Ventana de analisis");
    expect(text(html)).toContain("ventana 0–125 min (125 min · 7.500 muestras)");
    expect(html).toMatch(/Inicio \(min\)<\/span><input[^>]*value="0"/);
    expect(html).toMatch(/Fin \(min\)<\/span><input[^>]*value="125"/);
    // Marcas del rango: inicio, cuartos y fin.
    for (const tick of ["00:00:00", "00:31:15", "01:02:30", "01:33:45", "02:05:00"]) {
      expect(text(html)).toContain(tick);
    }
  });

  it("las manijas del rango se manejan con el teclado", () => {
    const html = renderPage({ detail: DETAIL, samples: FULL_SAMPLES });
    const sliders = [...html.matchAll(/<div[^>]*role="slider"[^>]*>/g)].map((m) => m[0]);
    expect(sliders).toHaveLength(2);
    expect(sliders[0]).toContain('aria-label="Inicio de la ventana"');
    expect(sliders[0]).toContain('aria-valuetext="00:00:00"');
    expect(sliders[1]).toContain('aria-label="Fin de la ventana"');
    expect(sliders[1]).toContain('aria-valuenow="7500"');
    for (const slider of sliders) expect(slider).toContain('tabindex="0"');
  });

  it("reproduccion en pausa, con el cursor al final y 60x por defecto", () => {
    const html = renderPage({ detail: DETAIL, samples: FULL_SAMPLES });
    expect(html).toMatch(/aria-label="Reproducir"[^>]*data-playing="false"/);
    expect(text(html)).toContain("Reiniciar");
    const pressed = [...html.matchAll(/aria-pressed="true"[^>]*>([^<]+)</g)].map((m) => m[1]);
    expect(pressed).toContain("60×");
    for (const speed of ["1×", "10×", "600×"]) expect(text(html)).toContain(speed);
    expect(html).toMatch(/aria-label="Cursor de la reproduccion"/);
    expect(text(html)).toContain("cursor = 02:05:00");
    expect(text(html)).toContain("t = 125 / 125 min");
  });

  it("avisa si las variables elegidas no tienen datos en la operacion", () => {
    const samples = samplesResponse([sample(0, { POTM4: null, POSBC1: 10 })]);
    const html = renderPage({ detail: DETAIL, samples });
    expect(text(html)).toContain("La operacion no tiene datos de las variables elegidas.");
  });

  it("mientras llegan las series lo dice", () => {
    const html = renderPage({ detail: DETAIL });
    expect(text(html)).toContain("Cargando las series...");
    expect(text(html)).toContain("Pulso de prueba");
  });

  it("mientras llega el detalle muestra el estado cargando con el ID de la URL", () => {
    const html = renderPage();
    expect(html).toContain('data-state="loading"');
    expect(text(html)).toContain("Cargando la operacion...");
    expect(text(html)).toContain(`Operacion ${ID}`);
    expect(text(html)).not.toContain("·");
  });
});

describe("OperationDetailView", () => {
  it("un 404 dice que la operacion no existe y ofrece volver al listado", () => {
    const html = renderView({ screen: "notFound" });
    expect(html).toContain('role="alert"');
    expect(html).toContain('data-state="notFound"');
    expect(text(html)).toContain("La operacion no existe");
    expect(html.match(/href="\/historicals\?page=3"/g)).toHaveLength(2);
    expect(html).not.toContain("Nucleo del reactor");
  });

  it("otro error se puede reintentar", () => {
    const html = renderView({ screen: "error" });
    expect(html).toContain('role="alert"');
    expect(text(html)).toContain("No se pudo cargar la operacion.");
    expect(text(html)).toContain("Reintentar");
  });
});
