// POST /exports/log: constancia de una imagen exportada (RNF03, tarea 5.8).
// La comparten Tiempo Real y los historicos. El CSV no pasa por aca: lo
// registra el backend al generarlo.
import { ENDPOINTS } from "./endpoints";
import { httpClient } from "./httpClient";

/** ExportLogRequest del backend (domains/exports/schemas.py). */
export interface ExportLogRequest {
  format: "png";
  source: "realtime" | "historicals";
  operation_id: string | null;
  /** Las del grafico (1 o 2). */
  variables: string[];
  /** Ventana del grafico, en segundos desde el inicio de la operacion. */
  start: number | null;
  end: number | null;
  file_name: string;
}

export const exportsApi = {
  logExport: (body: ExportLogRequest) => httpClient.post<void>(ENDPOINTS.exportsLog, body),
};
