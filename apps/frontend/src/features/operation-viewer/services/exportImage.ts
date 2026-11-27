// Exportar el PNG del grafico (tarea 5.8), igual en Tiempo Real y en el
// historico: pedirle la imagen al grafico (ChartHandle.toImage), guardarla
// con su nombre y dejar constancia en el backend (RNF03).
import {
  ChartImageUnavailableError,
  type ChartHandle,
  type ChartImageOptions,
} from "@/components/charts/types";
import { exportsApi, type ExportLogRequest } from "@/services/api/exportsApi";
import { downloadBlob } from "@/services/download";

export interface ExportChartImageInput {
  /** El handle del grafico (ref de ChartRenderer); null si no esta montado. */
  chart: ChartHandle | null;
  image: ChartImageOptions;
  fileName: string;
  log: Omit<ExportLogRequest, "format" | "file_name">;
}

export interface ExportChartImageDeps {
  download: (blob: Blob, fileName: string) => void;
  logExport: (body: ExportLogRequest) => Promise<unknown>;
}

const DEFAULT_DEPS: ExportChartImageDeps = {
  download: downloadBlob,
  logExport: exportsApi.logExport,
};

export async function exportChartImage(
  { chart, image, fileName, log }: ExportChartImageInput,
  { download, logExport }: ExportChartImageDeps = DEFAULT_DEPS,
): Promise<void> {
  if (chart === null) throw new ChartImageUnavailableError();
  const blob = await chart.toImage(image);
  download(blob, fileName);
  // La constancia va despues y no frena la descarga: el archivo ya esta en
  // la maquina del usuario, y un backend caido no deberia impedir guardar
  // un grafico que se esta viendo. Si falla, queda en la consola.
  try {
    await logExport({ ...log, format: "png", file_name: fileName });
  } catch (error) {
    console.warn("No se pudo registrar la exportacion", error);
  }
}

/** Si alguna de las variables tiene puntos para dibujar. Sin ninguno el
 *  grafico es un mensaje o ejes vacios: no hay imagen que valga exportar. */
export function hasPoints(
  variableIds: readonly string[],
  series: Readonly<Record<string, readonly unknown[] | undefined>>,
): boolean {
  return variableIds.some((id) => (series[id]?.length ?? 0) > 0);
}
