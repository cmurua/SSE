// Logica del panel de barras de control (tarea 5.4). Funciones puras, para
// probarlas sin renderizar. Como el resto del visor, no sabe de donde salen
// los datos: Tiempo Real le pasa la ultima muestra y el historico, la de la
// posicion del cursor.
import type { ChartPoint } from "@/components/charts/types";
import type { ReactorVariable } from "@/types/reactor";
import { latestValue } from "./instantValues";

/** Grupo del catalogo con las barras de control. El panel muestra todas las
 *  variables de este grupo, en el orden del catalogo: si el catalogo suma una
 *  barra (por ejemplo, una de seguridad), aparece sin cambiar codigo. */
export const CONTROL_BARS_GROUP = "SBC";

/** Nivel de moderador en el nucleo ("Nivel del Nucleo 1", grupo SCM): el
 *  tanque del panel, el NIV_MOD del prototipo. Es el mismo ID que
 *  MODERATOR_LEVEL en el backend (app/domains/realtime/service.py), que lo
 *  manda en todas las muestras. Si el catalogo no lo trae, no hay tanque. */
export const MODERATOR_LEVEL_ID = "NN1";

/** Estado del nivel de moderador, con los umbrales del prototipo. */
export type ModeratorStatus = "none" | "nominal" | "low" | "critical";

/** Una "foto" de la planta: el valor de cada variable en un instante. Sin
 *  entrada, o con null, no hay dato. */
export type ControlBarsSnapshot = Record<string, number | null | undefined>;

/** Color de una barra segun su posicion. Los rangos son los del prototipo
 *  (ControlBarsPanel.jsx). `none` es sin dato o en 0, y va en gris. */
export type ControlBarTone = "none" | "low" | "mid" | "high";

export function controlBarVariables(catalog: readonly ReactorVariable[] | undefined): ReactorVariable[] {
  return (catalog ?? []).filter((variable) => variable.group === CONTROL_BARS_GROUP);
}

export function moderatorLevelVariable(
  catalog: readonly ReactorVariable[] | undefined,
): ReactorVariable | undefined {
  return catalog?.find((variable) => variable.id === MODERATOR_LEVEL_ID);
}

/** IDs de todo lo que dibuja el panel: las barras y el nivel de moderador. */
export function panelVariableIds(catalog: readonly ReactorVariable[] | undefined): string[] {
  const ids = controlBarVariables(catalog).map((variable) => variable.id);
  const moderator = moderatorLevelVariable(catalog);
  return moderator ? [...ids, moderator.id] : ids;
}

/** Valor en su escala del catalogo, de 0 a 100 (posicion de una barra o
 *  nivel del tanque). null = sin dato. Un valor fuera de escala se recorta al
 *  borde: no puede dibujarse fuera del canal. */
export function barPercent(
  variable: Pick<ReactorVariable, "min" | "max">,
  value: number | null | undefined,
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const span = variable.max - variable.min;
  if (!(span > 0)) return null;
  const pct = ((value - variable.min) / span) * 100;
  return Math.max(0, Math.min(100, pct));
}

export function barTone(pct: number | null): ControlBarTone {
  if (pct === null) return "none";
  if (pct > 80) return "high";
  if (pct > 50) return "mid";
  if (pct > 0) return "low";
  return "none";
}

export function moderatorStatus(pct: number | null): ModeratorStatus {
  if (pct === null) return "none";
  if (pct >= 95) return "nominal";
  if (pct >= 80) return "low";
  return "critical";
}

/** La foto de la ultima muestra: el ultimo punto de cada serie, siempre que
 *  sea de esa muestra. Si el canal no publico nada en ella, la barra queda
 *  sin dato (gris) en vez de mostrar una posicion vieja como actual. */
export function latestSnapshot(
  ids: readonly string[],
  series: Record<string, readonly ChartPoint[] | undefined>,
  lastSampleAt: number | null,
): ControlBarsSnapshot {
  const snapshot: ControlBarsSnapshot = {};
  for (const id of ids) {
    const latest = latestValue(series[id], lastSampleAt);
    snapshot[id] = latest?.current ? latest.value : null;
  }
  return snapshot;
}
