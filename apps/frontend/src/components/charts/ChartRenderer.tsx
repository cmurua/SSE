// Unico punto de entrada publico para graficos. Las paginas SIEMPRE
// importan ChartRenderer desde aca, nunca un adapter ni una libreria
// de terceros directamente. Ver ADR 0002 (docs/decisions/).
import { activeChartAdapter } from "./activeAdapter";
import type { ChartRendererProps } from "./types";

export function ChartRenderer(props: ChartRendererProps) {
  const Adapter = activeChartAdapter;
  return <Adapter {...props} />;
}
