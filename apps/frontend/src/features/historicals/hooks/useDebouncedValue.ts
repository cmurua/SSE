import { useEffect, useState } from "react";

/** `value` recien cuando deja de cambiar durante `ms`: la ventana de analisis
 *  se pide al soltar la manija o terminar de escribir, no en cada paso. */
export function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}
