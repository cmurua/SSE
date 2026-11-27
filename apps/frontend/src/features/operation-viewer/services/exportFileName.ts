// Nombre de los archivos exportados (tarea 5.8):
//
//     SSE_<operacion>_<variables>_<inicio>-<fin>.<extension>
//     SSE_OP-2025-001_LOGA1-POTM4_00h05m00s-01h30m00s.png
//
// - <operacion>: el ID, con lo que no sea letra, digito o guion cambiado por
//   un guion (el `_` separa los campos; `/` o `:` no van en un nombre de
//   archivo de Windows).
// - <variables>: los IDs separados por guiones, o `todas` si es el catalogo
//   entero.
// - <inicio>-<fin>: la ventana medida desde el inicio de la operacion, con el
//   inicio redondeado hacia abajo y el fin hacia arriba. Sin ventana (p. ej.
//   Tiempo Real sin el inicio de la operacion), el campo no va.
//
// El backend arma el mismo nombre para el CSV en
// apps/backend/app/domains/exports/file_names.py: si cambia uno, cambiar el
// otro. Los tests de los dos usan los mismos casos.

export const ALL_VARIABLES_LABEL = "todas";

export interface ExportWindow {
  /** Segundos desde el inicio de la operacion. */
  start: number;
  end: number;
}

export interface ExportFileNameInput {
  operationId: string | null;
  variableIds: readonly string[];
  /** El catalogo entero: el nombre lleva `todas` en lugar de los IDs. */
  allVariables?: boolean;
  window: ExportWindow | null;
  extension: "png" | "csv";
}

function safe(text: string): string {
  return text.replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "sin-id";
}

const pad = (n: number) => String(n).padStart(2, "0");

/** `5400` -> `01h30m00s`. Las horas siguen sumando pasadas las 99. */
export function formatOffset(seconds: number): string {
  const total = Math.max(0, Math.trunc(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return `${pad(hours)}h${pad(minutes)}m${pad(total % 60)}s`;
}

export function exportFileName({
  operationId,
  variableIds,
  allVariables = false,
  window,
  extension,
}: ExportFileNameInput): string {
  const variables = allVariables ? ALL_VARIABLES_LABEL : variableIds.map(safe).join("-");
  const parts = ["SSE", safe(operationId ?? ""), variables];
  if (window !== null) {
    parts.push(`${formatOffset(Math.floor(window.start))}-${formatOffset(Math.ceil(window.end))}`);
  }
  return `${parts.join("_")}.${extension}`;
}
