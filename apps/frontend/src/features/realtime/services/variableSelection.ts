// Reglas del selector de variables (RF05). Funciones puras, separadas de
// VariableSelector para poder probarlas sin renderizar.
import type { ReactorVariable } from "@/types/reactor";

/** RF05: hasta dos variables a la vez. El backend aplica el mismo tope
 *  (`too_many_variables`). */
export const MAX_SELECTED_VARIABLES = 2;

/** Seleccion al entrar: la potencia, la variable principal del RA-0. Deja
 *  libre el segundo lugar. */
export const DEFAULT_SELECTION: readonly string[] = ["POTM4"];

/** Si `id` se puede agregar: no esta elegida y queda lugar. */
export function canSelect(selection: readonly string[], id: string): boolean {
  return !selection.includes(id) && selection.length < MAX_SELECTED_VARIABLES;
}

/**
 * Agrega o quita `id`. Con el tope alcanzado, una variable nueva NO
 * desplaza a otra: la seleccion queda igual (el selector ya la muestra
 * deshabilitada). El orden es el de eleccion: el primero es la Variable A.
 * Al quitar la A, la B pasa a ser la A.
 */
export function toggleVariable(selection: readonly string[], id: string): string[] {
  if (selection.includes(id)) return selection.filter((item) => item !== id);
  if (!canSelect(selection, id)) return [...selection];
  return [...selection, id];
}

export interface VariableGroup {
  code: string;
  name: string;
  variables: ReactorVariable[];
}

// Sin mayusculas ni tildes: "logaritmico" encuentra "Logarítmico".
function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** Agrupa el catalogo por subsistema, en el orden en que llega del backend,
 *  y filtra por nombre, ID o grupo. Los grupos sin coincidencias se omiten. */
export function groupVariables(
  catalog: readonly ReactorVariable[],
  query = "",
): VariableGroup[] {
  const needle = normalize(query.trim());
  const groups = new Map<string, VariableGroup>();

  for (const variable of catalog) {
    if (needle) {
      const haystack = [variable.name, variable.id, variable.group, variable.group_name];
      if (!haystack.some((field) => normalize(field).includes(needle))) continue;
    }
    let group = groups.get(variable.group);
    if (group === undefined) {
      group = { code: variable.group, name: variable.group_name, variables: [] };
      groups.set(variable.group, group);
    }
    group.variables.push(variable);
  }
  return [...groups.values()];
}

/** Un extremo del rango, corto: notacion cientifica para magnitudes muy
 *  grandes o muy chicas (1e5, 1e-3), y si no, hasta 4 cifras significativas. */
export function formatBound(value: number): string {
  const magnitude = Math.abs(value);
  if (magnitude !== 0 && (magnitude >= 1e4 || magnitude < 1e-2)) {
    const [mantissa, exponent] = value.toExponential().split("e");
    return `${Number(Number(mantissa).toPrecision(3))}e${Number(exponent)}`;
  }
  return String(Number(value.toPrecision(4)));
}

/** "[0, 10] W" */
export function formatRange(variable: Pick<ReactorVariable, "min" | "max" | "unit">): string {
  return `[${formatBound(variable.min)}, ${formatBound(variable.max)}] ${variable.unit}`;
}
