// Modo del grafico: variable vs. tiempo o variable vs. variable (RF05).
// Funcion pura, separada de ChartModeToggle para probarla sin renderizar.
import type { ChartMode } from "@/components/charts/types";

/** Modo que se muestra: el elegido, salvo que no haya 2 variables para el
 *  X·Y. Se guarda el elegido aparte para que, si se quita la Variable B y se
 *  elige otra, el grafico vuelva solo a X·Y. */
export function displayedChartMode(preferred: ChartMode, variableCount: number): ChartMode {
  return preferred === "xy" && variableCount < 2 ? "time" : preferred;
}
