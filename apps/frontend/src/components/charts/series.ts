// Identidad visual de Variable A y Variable B (RF05: hasta dos a la vez).
// La comparten el selector de variables y el grafico, para que una variable
// tenga el mismo color en los dos. Los colores son tokens de tokens.css:
// - `className` fija --series en un elemento HTML; las clases series-dot,
//   series-border, series-fill y series-text (globals.css) la usan.
// - `color` sirve directo como fill/stroke en SVG.
// - `token` es la variable CSS, para resolver el color con getComputedStyle
//   donde no hay hoja de estilos (la imagen exportada).
export const CHART_SERIES = [
  { label: "A", className: "series-a", color: "var(--series-a)", token: "--series-a" },
  { label: "B", className: "series-b", color: "var(--series-b)", token: "--series-b" },
] as const;

export type ChartSeries = (typeof CHART_SERIES)[number];

/** Identidad de la variable en la posicion `index` de la seleccion. */
export function seriesAt(index: number): ChartSeries | null {
  return CHART_SERIES[index] ?? null;
}
