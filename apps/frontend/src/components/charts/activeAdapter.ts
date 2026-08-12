// UNICO switch point para cambiar de libreria de graficos: hoy usa el
// placeholder SVG portado del prototipo. Cuando se elija una libreria
// real (Recharts, ECharts, visx, ...), crear su carpeta en adapters/ y
// cambiar esta unica linea.
import { PlaceholderChartAdapter } from "./adapters/placeholder/PlaceholderChartAdapter";

export const activeChartAdapter = PlaceholderChartAdapter;
