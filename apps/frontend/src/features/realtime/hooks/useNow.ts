// Hora actual, que se actualiza sola cada `intervalMs`. Para lo que tiene que
// avanzar aunque no lleguen datos: la duracion de la operacion y el "hace N s"
// de los datos desactualizados.
import { useEffect, useState } from "react";

export function useNow(intervalMs = 1_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
