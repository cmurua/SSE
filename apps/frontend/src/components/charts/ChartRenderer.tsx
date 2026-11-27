// Unico punto de entrada publico para graficos. Las paginas SIEMPRE
// importan ChartRenderer desde aca, nunca un adapter ni una libreria
// de terceros directamente. Ver ADR 0002 (docs/decisions/).
//
// Con `ref` se obtiene el ChartHandle del adapter activo (p. ej. toImage()
// para exportar el PNG), sin saber que libreria dibuja.
import { forwardRef } from "react";
import { activeChartAdapter } from "./activeAdapter";
import type { ChartHandle, ChartRendererProps } from "./types";

export const ChartRenderer = forwardRef<ChartHandle, ChartRendererProps>(
  function ChartRenderer(props, ref) {
    const Adapter = activeChartAdapter;
    return <Adapter ref={ref} {...props} />;
  },
);
