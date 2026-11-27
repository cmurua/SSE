// Se renderiza a HTML con react-dom/server, como PlaceholderChartAdapter: el
// proyecto no tiene jsdom.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import "@/i18n";
import type { ReactorVariable } from "@/types/reactor";
import { ControlBarsPanel } from "./ControlBarsPanel";

function variable(id: string, name: string, group: string, unit = "%"): ReactorVariable {
  return { id, name, unit, group, group_name: group, min: 0, max: 100, nominal: 50, kind: "medida" };
}

const bar = (n: number) => variable(`POSBC${n}`, `Posicion Barra de Control ${n}`, "SBC");
const NIVEL = variable("NN1", "Nivel del Nucleo 1", "SCM");
const POTENCIA = { ...variable("POTM4", "Potencia", "SSO", "W"), max: 10 };

const CATALOG = [POTENCIA, bar(1), bar(2), bar(3), bar(4), NIVEL];
const WITHOUT_TANK = CATALOG.filter((v) => v.id !== "NN1");

function render(snapshot: Record<string, number | null>, catalog = CATALOG) {
  return renderToStaticMarkup(<ControlBarsPanel catalog={catalog} snapshot={snapshot} />);
}

/** [variable, tono] de cada barra dibujada, en orden. */
function bars(html: string): [string, string][] {
  return [...html.matchAll(/data-variable="([^"]+)" data-tone="([^"]+)"/g)].map((m) => [m[1], m[2]]);
}

/** Estado del tanque, o null si no se dibujo. */
function tank(html: string): string | null {
  return html.match(/data-variable="NN1" data-status="([^"]+)"/)?.[1] ?? null;
}

describe("ControlBarsPanel: barras", () => {
  it("dibuja una barra por cada variable SBC del catalogo, con su nombre", () => {
    const html = render({ POSBC1: 10, POSBC2: 60, POSBC3: 90, POSBC4: 0, POTM4: 5 });

    expect(bars(html).map(([id]) => id)).toEqual(["POSBC1", "POSBC2", "POSBC3", "POSBC4"]);
    for (let n = 1; n <= 4; n++) expect(html).toContain(`Posicion Barra de Control ${n}`);
    expect(html).not.toContain("Potencia");
  });

  it("no usa los ids inventados del mock", () => {
    const html = render({ POS_BR1: 50, POS_BRS: 100, NIV_MOD: 98 });

    for (const id of ["POS_BR", "POS_BRS", "NIV_MOD"]) expect(html).not.toContain(id);
    expect(tank(html)).toBe("none");
  });

  it("muestra la posicion con la unidad del catalogo, no el % de insercion", () => {
    const html = render({ POSBC1: 58.24 });

    expect(html).toContain("58.2%");
    expect(html).toContain("Posicion (%)");
    expect(html).not.toMatch(/inserci/i);
  });

  it("colorea cada barra por rango", () => {
    const html = render({ POSBC1: 10, POSBC2: 60, POSBC3: 90, POSBC4: 0 });

    expect(bars(html)).toEqual([
      ["POSBC1", "low"],
      ["POSBC2", "mid"],
      ["POSBC3", "high"],
      ["POSBC4", "none"],
    ]);
  });

  it("sin dato la barra va en gris y con guion", () => {
    const html = render({ POSBC1: 10, POSBC2: null }, WITHOUT_TANK);

    expect(bars(html)).toEqual([
      ["POSBC1", "low"],
      ["POSBC2", "none"],
      ["POSBC3", "none"],
      ["POSBC4", "none"],
    ]);
    expect(html.match(/>—</g)).toHaveLength(3);
  });

  it("una barra nueva en el catalogo se dibuja sin cambiar codigo", () => {
    const html = render({}, [...CATALOG, { ...bar(5), id: "POSBS", name: "Barra de Seguridad" }]);

    expect(bars(html).map(([id]) => id)).toContain("POSBS");
    expect(html).toContain("Barra de Seguridad");
  });
});

describe("ControlBarsPanel: tanque de moderador", () => {
  it("muestra el nivel de NN1 con su estado", () => {
    const html = render({ NN1: 98.04 });

    expect(tank(html)).toBe("nominal");
    expect(html).toContain("Nivel de moderador");
    expect(html).toContain("98.0");
    expect(html).toContain("Nominal");
    expect(html).toContain("barras · moderador");
  });

  it("usa los umbrales del prototipo", () => {
    expect(tank(render({ NN1: 85 }))).toBe("low");
    expect(render({ NN1: 85 })).toContain("Bajo");
    expect(tank(render({ NN1: 50 }))).toBe("critical");
    expect(render({ NN1: 50 })).toContain("Critico");
  });

  it("sin dato el tanque va en gris y con guion", () => {
    const html = render({ NN1: null });

    expect(tank(html)).toBe("none");
    expect(html).not.toContain("Nominal");
  });

  it("si el catalogo no trae NN1, solo se dibujan las barras", () => {
    const html = render({ POSBC1: 10 }, WITHOUT_TANK);

    expect(tank(html)).toBeNull();
    expect(html).not.toContain("Nivel de moderador");
    expect(html).toContain("barras de control");
    expect(bars(html)).toHaveLength(4);
  });
});

describe("ControlBarsPanel: sin datos del catalogo", () => {
  it("sin catalogo, o sin barras ni nivel de moderador, no se muestra", () => {
    expect(renderToStaticMarkup(<ControlBarsPanel catalog={undefined} snapshot={{}} />)).toBe("");
    expect(render({}, [POTENCIA])).toBe("");
  });
});
