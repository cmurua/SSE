// Franja de metadatos de una operacion, arriba del grafico. Puerto del
// "status strip" de Realtime.jsx (tarea 3.7).
//
// Compartida entre Tiempo Real y el historico (tarea 5.3): solo dibuja la
// grilla de casilleros. Que casilleros van y su contenido lo arma cada
// pantalla (en Tiempo Real, ver realtime/components/LiveOperationStrip.tsx).
import type { CSSProperties, ReactNode } from "react";

export interface OperationTile {
  /** Identifica el casillero entre renders. */
  key: string;
  label: string;
  value: ReactNode;
  /** Valor en monoespaciada (IDs, horas, duraciones). */
  mono?: boolean;
  /** Mas ancho en escritorio (1.4 veces) y las dos columnas en celular,
   *  para un contenido que no entra en una celda comun. */
  wide?: boolean;
}

export interface OperationStripProps {
  tiles: OperationTile[];
}

/** Columnas de la grilla en escritorio: una por casillero, 1.4fr los anchos
 *  y 1fr el resto. */
export function stripColumns(tiles: readonly Pick<OperationTile, "wide">[]): string {
  return tiles.map((tile) => (tile.wide ? "1.4fr" : "1fr")).join(" ");
}

export function OperationStrip({ tiles }: OperationStripProps) {
  return (
    // Celdas separadas por el fondo (gap-px sobre --line) y no con bordes:
    // asi la grilla queda bien en 2 columnas (celular) y en una por casillero.
    <div
      className="card grid grid-cols-2 md:grid-cols-[var(--strip-columns)] gap-px bg-line overflow-hidden"
      // Va como variable CSS para que en celular siga mandando grid-cols-2.
      style={{ "--strip-columns": stripColumns(tiles) } as CSSProperties}
    >
      {tiles.map((tile) => (
        <Tile key={tile.key} label={tile.label} mono={tile.mono} wide={tile.wide}>
          {tile.value}
        </Tile>
      ))}
    </div>
  );
}

function Tile({
  label,
  mono = false,
  wide = false,
  children,
}: {
  label: string;
  mono?: boolean;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={"bg-surface px-5 py-3.5 min-w-0" + (wide ? " col-span-2 md:col-span-1" : "")}>
      <div className="text-[10px] uppercase tracking-widest text-muted font-mono">{label}</div>
      <div className={"mt-1.5 text-[15px] font-semibold truncate " + (mono ? "font-mono" : "")}>
        {children}
      </div>
    </div>
  );
}
