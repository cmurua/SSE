// Puerto de ChartPlaceholder.jsx (SVG a mano, sin dependencias). Sirve
// como implementacion por defecto y como referencia de contrato para
// cualquier adapter futuro (mismas props: variables, data, mode, title, height).
import type { ChartRendererProps } from "../../types";

export function PlaceholderChartAdapter(props: ChartRendererProps) {
  return <div className="card">{/* TODO: portar la logica SVG de ChartPlaceholder.jsx */}</div>;
}
