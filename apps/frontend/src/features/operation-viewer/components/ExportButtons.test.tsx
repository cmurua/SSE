// Se renderiza a HTML con react-dom/server, como el resto del visor: el
// proyecto no tiene jsdom. Se prueba la vista sin estado en cada caso.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import "@/i18n";
import { ExportButtons, ExportButtonsView, type ExportButtonsViewProps } from "./ExportButtons";

const noop = () => {};

function render(props: Partial<ExportButtonsViewProps> = {}) {
  return renderToStaticMarkup(
    <ExportButtonsView busy={null} failed={null} pngAvailable onPng={noop} onCsv={noop} {...props} />,
  );
}

/** El <button> de cada exportacion, o null si no esta. */
function button(html: string, kind: "png" | "csv"): string | null {
  return html.match(new RegExp(`<button[^>]*data-export="${kind}"[^>]*>.*?</button>`))?.[0] ?? null;
}

const isDisabled = (tag: string | null) => tag !== null && /\sdisabled=""/.test(tag);

describe("ExportButtons", () => {
  it("en los historicos muestra Exportar tabla y Exportar PNG", () => {
    const html = render();
    expect(button(html, "csv")).toContain("Exportar tabla");
    expect(button(html, "png")).toContain("Exportar PNG");
    expect(isDisabled(button(html, "csv"))).toBe(false);
    expect(isDisabled(button(html, "png"))).toBe(false);
    expect(html).not.toContain('role="alert"');
  });

  it("sin accion de tabla (Tiempo Real) solo muestra el PNG", () => {
    const html = renderToStaticMarkup(
      <ExportButtons onExportPng={async () => {}} pngAvailable />,
    );
    expect(button(html, "csv")).toBeNull();
    expect(button(html, "png")).toContain("Exportar PNG");
  });

  it("sin grafico dibujado el PNG queda deshabilitado y lo explica", () => {
    const html = render({ pngAvailable: false });
    expect(isDisabled(button(html, "png"))).toBe(true);
    expect(button(html, "png")).toContain('title="No hay grafico para exportar."');
    // La tabla no depende del grafico.
    expect(isDisabled(button(html, "csv"))).toBe(false);
  });

  it("mientras exporta deshabilita los dos y muestra el progreso en el que corre", () => {
    const html = render({ busy: "csv" });
    expect(button(html, "csv")).toContain("Exportando...");
    expect(button(html, "png")).toContain("Exportar PNG");
    expect(isDisabled(button(html, "csv"))).toBe(true);
    expect(isDisabled(button(html, "png"))).toBe(true);
  });

  it.each([
    ["png", "No se pudo exportar el grafico."],
    ["csv", "No se pudo descargar la tabla."],
  ] as const)("avisa si fallo la exportacion %s", (failed, message) => {
    expect(render({ failed })).toContain(`role="alert" class="text-[12px] text-bad">${message}</span>`);
  });
});
