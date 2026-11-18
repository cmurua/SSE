# Abstraccion de graficos (chart-library-agnostic)

`ChartRenderer` es el UNICO componente que las features deben importar
para dibujar graficos. Por detras, `activeAdapter.ts` decide que
implementacion concreta se usa (hoy: `adapters/placeholder`, un SVG a
mano portado del prototipo de Claude Design).

Para elegir/cambiar de libreria en el futuro:
1. Crear `adapters/<libreria>/` con un componente que cumpla `ChartRendererProps`.
2. Cambiar la unica linea de `activeAdapter.ts`.
3. Ninguna pagina (`RealtimePage`, `OperationDetailPage`) deberia requerir cambios.

La regla se verifica en `architecture.test.ts`: falla si un archivo fuera de
`components/charts/` importa un adapter o una libreria de graficos.

## Adapter placeholder

SVG a mano, sin dependencias. Los calculos (escalas, marcas redondas de los
ejes, trazados, cortes en los huecos de datos) estan en
`adapters/placeholder/geometry.ts` como funciones puras; el componente solo
dibuja. Los colores salen de clases de `globals.css` (`chart-*`, `series-*`)
que usan los tokens, y Variable A / B de `series.ts`.

Modo `time`:
- Con `timeWindowMs` el eje X tiene ancho fijo y termina en la ultima
  muestra (tiempo real); sin el, se ajusta a los datos (historicos).
- El eje Y se ajusta a los datos visibles. Dos variables con la misma unidad
  comparten eje; con distinta unidad, A va a la izquierda y B a la derecha.
- La linea se corta si entre dos muestras pasa mas de 3 veces el intervalo
  tipico, para no esconder un corte de datos.

Modo `xy`: la Variable B (eje Y) en funcion de la A (eje X).
- Los pares se arman por timestamp, no por indice: un instante que falta
  en una serie (un `null` del canal) no forma par ni desfasa los demas.
- Se dibuja la trayectoria en orden de tiempo, con el ultimo par
  resaltado. Usa la misma `timeWindowMs` que el modo tiempo y se corta en
  los huecos igual.
