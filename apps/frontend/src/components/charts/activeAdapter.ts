// UNICO switch point para cambiar de libreria de graficos: hoy usa el
// placeholder SVG portado del prototipo. Cuando se elija una libreria
// real (Recharts, ECharts, visx, ...), crear su carpeta en adapters/ y
// cambiar esta unica linea.
import { PlaceholderChartAdapter } from "./adapters/placeholder/PlaceholderChartAdapter";
import type { ChartAdapter } from "./types";

// Tipado como ChartAdapter: un adapter que no cumpla el contrato (props y
// handle con toImage) no compila.
export const activeChartAdapter: ChartAdapter = PlaceholderChartAdapter;
