# Abstraccion de graficos (chart-library-agnostic)

`ChartRenderer` es el UNICO componente que las features deben importar
para dibujar graficos. Por detras, `activeAdapter.ts` decide que
implementacion concreta se usa (hoy: `adapters/placeholder`, un SVG a
mano portado del prototipo de Claude Design).

Para elegir/cambiar de libreria en el futuro:
1. Crear `adapters/<libreria>/` con un componente que cumpla `ChartRendererProps`.
2. Cambiar la unica linea de `activeAdapter.ts`.
3. Ninguna pagina (`RealtimePage`, `OperationDetailPage`) deberia requerir cambios.
