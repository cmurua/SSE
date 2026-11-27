# ADR 0002 — Diferir la eleccion de libreria de graficos

## Estado
Aceptado.

## Contexto
El pedido explicito es no acoplar el frontend a una libreria de graficos
todavia, ya que no esta definida (ver "requisitos funcionales - Graficos").

## Decision
Todas las pantallas consumen un unico componente `ChartRenderer`
(`apps/frontend/src/components/charts/ChartRenderer.tsx`), que delega en
un adapter intercambiable (`activeAdapter.ts`). Hoy el adapter activo es
un SVG a mano portado del prototipo (`adapters/placeholder`). Elegir una
libreria en el futuro implica: crear su adapter + cambiar una linea en
`activeAdapter.ts`. Ninguna pagina debe importar la libreria directamente.

## Consecuencias
El placeholder actual no tiene todas las capacidades de una libreria real
(zoom, tooltips avanzados); se acepta esa limitacion a cambio de no
bloquear el desarrollo del resto del sistema.

El contrato tiene dos partes: las props (`ChartRendererProps`, que
dibujar) y un handle que se obtiene con `ref` (`ChartHandle`, que se le
puede pedir al grafico ya dibujado). Hoy el handle tiene `toImage()`, que
devuelve el PNG del grafico visible (tarea 5.8). Un adapter nuevo tiene que
implementar los dos; `activeAdapter.ts` esta tipado como `ChartAdapter`, asi
que uno incompleto no compila. Para un adapter que dibuje en SVG alcanza con
`svgChartToPng` (`components/charts/svgImage.ts`); uno que dibuje en canvas
puede usar `canvas.toBlob` directamente.
