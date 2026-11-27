// Tarea 5.3: el visor de operacion lo comparten Tiempo Real y el historico,
// asi que no puede depender de ninguno de los dos ni del origen de los datos
// (WebSocket o REST). Los datos le llegan por props. Este test recorre el
// modulo y falla si algun archivo importa de otra feature o del WebSocket.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const VIEWER = fileURLToPath(new URL(".", import.meta.url));

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

// Otra feature (por alias o subiendo fuera del modulo) o el cliente WebSocket.
const FORBIDDEN = [/^@\/features\//, /^\.\.\/\.\.\//, /services\/websocket/];

describe("visor de operacion compartido (tarea 5.3)", () => {
  const files = sourceFiles(VIEWER);

  it("hay archivos que revisar", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("no importa de features/realtime, de otra feature ni del WebSocket", () => {
    const offenders = files.flatMap((file) =>
      importsOf(file)
        .filter((spec) => FORBIDDEN.some((pattern) => pattern.test(spec)))
        .map((spec) => `${relative(VIEWER, file)} -> ${spec}`),
    );
    expect(offenders).toEqual([]);
  });
});
