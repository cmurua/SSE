// ADR 0002: las paginas dibujan graficos SOLO a traves de ChartRenderer.
// Este test recorre src/ y falla si algun archivo fuera de components/charts/
// importa un adapter o una libreria de graficos directamente. Asi la regla no
// depende de que alguien se acuerde en cada revision.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("../..", import.meta.url));
const CHARTS = join(SRC, "components", "charts") + sep;

// Librerias candidatas (ver adapters/recharts/README.md). Si se elige otra,
// sumarla aca.
const CHART_LIBRARIES = ["recharts", "echarts", "chart.js", "@visx/", "d3", "plotly", "uplot"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

function importsOf(file: string): string[] {
  const source = readFileSync(file, "utf8");
  return [...source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]);
}

describe("arquitectura de graficos (ADR 0002)", () => {
  const outside = sourceFiles(SRC).filter((file) => !file.startsWith(CHARTS));

  it("hay archivos que revisar", () => {
    expect(outside.length).toBeGreaterThan(10);
  });

  it("ningun archivo fuera de components/charts importa un adapter", () => {
    const offenders = outside.flatMap((file) =>
      importsOf(file)
        .filter((spec) => /charts\/(adapters|activeAdapter)/.test(spec))
        .map((spec) => `${relative(SRC, file)} -> ${spec}`),
    );
    expect(offenders).toEqual([]);
  });

  it("ningun archivo fuera de components/charts importa una libreria de graficos", () => {
    const offenders = outside.flatMap((file) =>
      importsOf(file)
        .filter((spec) => CHART_LIBRARIES.some((lib) => spec === lib || spec.startsWith(lib)))
        .map((spec) => `${relative(SRC, file)} -> ${spec}`),
    );
    expect(offenders).toEqual([]);
  });
});
