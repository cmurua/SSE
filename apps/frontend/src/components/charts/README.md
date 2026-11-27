# Abstraccion de graficos (chart-library-agnostic)

`ChartRenderer` es el UNICO componente que las features deben importar
para dibujar graficos. Por detras, `activeAdapter.ts` decide que
implementacion concreta se usa (hoy: `adapters/placeholder`, un SVG a
mano portado del prototipo de Claude Design).

Para elegir/cambiar de libreria en el futuro:
1. Crear `adapters/<libreria>/` con un componente que cumpla `ChartRendererProps`
   y exponga `ChartHandle` por `ref` (`forwardRef` + `useImperativeHandle`).
2. Cambiar la unica linea de `activeAdapter.ts` (tipada como `ChartAdapter`:
   un adapter sin el handle no compila).
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

## Exportar imagen (`toImage()`)

`ChartHandle.toImage({ title, subtitle })` devuelve el PNG del grafico
visible (tarea 5.8). La pagina le pasa el titulo (operacion) y el subtitulo
(variables, ventana); la leyenda la agrega el adapter. Rechaza con
`ChartImageUnavailableError` si en lugar del grafico hay un mensaje.

El adapter placeholder usa `svgImage.ts`, que sirve para cualquier adapter
que dibuje en SVG:
1. Clona el `<svg>` y le copia a cada elemento los estilos calculados: los
   colores salen de clases y variables CSS, y un SVG dibujado como imagen no
   ve la hoja de estilos de la pagina.
2. Arma un SVG nuevo con titulo, subtitulo y leyenda arriba (en pantalla son
   HTML, fuera del `<svg>`) y el grafico debajo.
3. Lo dibuja en un canvas al doble de resolucion y pide `toBlob("image/png")`.

Las fuentes web (Inter, JetBrains Mono) no se embeben: un SVG dibujado como
imagen no puede cargarlas, asi que el PNG usa la fuente del sistema que
corresponda. Los tests corren sin navegador (DOM y canvas falsos); se
verifico a mano en Firefox.
