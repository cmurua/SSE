// SVG del grafico -> PNG, en el navegador (tarea 5.8). Lo usa el adapter
// placeholder y sirve para cualquier adapter futuro que dibuje en SVG; uno
// que dibuje en canvas puede llamar directo a canvas.toBlob.
//
// Pasos:
// 1. Clonar el <svg> y copiarle a cada elemento los estilos calculados. Los
//    colores del grafico salen de clases de globals.css con variables CSS, y
//    un SVG dibujado como imagen no ve la hoja de estilos de la pagina: sin
//    esto el PNG sale negro sobre transparente.
// 2. Armar un SVG nuevo con el titulo, la leyenda y el grafico debajo. El
//    titulo y la leyenda en pantalla son HTML, fuera del <svg>.
// 3. Dibujarlo en un canvas al doble de resolucion y pedirle el PNG.
//
// El paso 2 es una funcion pura y los pasos 1 y 3 reciben el entorno (DOM,
// canvas) como parametro, asi se prueban sin navegador.

/** Propiedades que definen como se ve el grafico. Lo demas (layout, cursor,
 *  transiciones) no importa en una imagen. */
export const INLINED_STYLE_PROPERTIES = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-dasharray",
  "stroke-linejoin",
  "stroke-linecap",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
  "text-anchor",
  "dominant-baseline",
] as const;

/** Lo minimo de un elemento del DOM que usa este modulo. */
export interface StylableNode {
  readonly children: ArrayLike<StylableNode>;
  setAttribute(name: string, value: string): void;
}

export interface StyleReader {
  getPropertyValue(property: string): string;
}

/** Copia los estilos calculados de `source` (y sus hijos) como atributo
 *  `style` de `target`, que tiene que ser un clon de `source`. */
export function inlineComputedStyles(
  source: StylableNode,
  target: StylableNode,
  getStyle: (node: StylableNode) => StyleReader,
): void {
  const style = getStyle(source);
  const declarations = INLINED_STYLE_PROPERTIES.map((property) => [
    property,
    style.getPropertyValue(property).trim(),
  ])
    .filter(([, value]) => value !== "")
    .map(([property, value]) => `${property}:${value}`);
  if (declarations.length > 0) target.setAttribute("style", declarations.join(";"));

  for (let i = 0; i < source.children.length; i++) {
    inlineComputedStyles(source.children[i], target.children[i], getStyle);
  }
}

export interface ImageLegendItem {
  /** "A" o "B". */
  label: string;
  name: string;
  unit: string;
  /** Lo que se aclara al lado (p. ej. "eje izq."). */
  note?: string;
  /** Color ya resuelto (no una variable CSS: la imagen no las ve). */
  color: string;
}

export interface ImagePalette {
  background: string;
  ink: string;
  muted: string;
  fontFamily: string;
}

export interface ComposeImageInput {
  /** El <svg> del grafico serializado, con los estilos ya copiados. */
  chart: string;
  /** Tamano del grafico; la imagen tiene el mismo ancho. */
  width: number;
  height: number;
  title: string;
  subtitle?: string;
  legend: ImageLegendItem[];
  palette: ImagePalette;
}

export interface ComposedImage {
  svg: string;
  width: number;
  height: number;
}

const PAD = 20;
const TITLE_SIZE = 16;
const TEXT_SIZE = 12;
const LINE_GAP = 6;
const LEGEND_SWATCH = 14;

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Recorta con "…" lo que no entraria en `width`. El ancho del texto se
 *  estima (no hay como medirlo sin DOM): mejor cortar de mas que salirse. */
export function fitText(text: string, width: number, fontSize: number): string {
  const maxChars = Math.max(1, Math.floor(width / (fontSize * 0.58)));
  return text.length <= maxChars ? text : text.slice(0, maxChars - 1).trimEnd() + "…";
}

/** Titulo, subtitulo y leyenda arriba; el grafico abajo. */
export function composeImageSvg({
  chart,
  width,
  height,
  title,
  subtitle,
  legend,
  palette,
}: ComposeImageInput): ComposedImage {
  const textWidth = width - 2 * PAD;
  const parts: string[] = [];
  let y = PAD;

  y += TITLE_SIZE;
  parts.push(
    `<text x="${PAD}" y="${y}" font-size="${TITLE_SIZE}" font-weight="600" fill="${escapeXml(palette.ink)}">` +
      `${escapeXml(fitText(title, textWidth, TITLE_SIZE))}</text>`,
  );
  if (subtitle) {
    y += LINE_GAP + TEXT_SIZE;
    parts.push(
      `<text x="${PAD}" y="${y}" font-size="${TEXT_SIZE}" fill="${escapeXml(palette.muted)}">` +
        `${escapeXml(fitText(subtitle, textWidth, TEXT_SIZE))}</text>`,
    );
  }
  for (const item of legend) {
    y += LINE_GAP + TEXT_SIZE;
    const text = `${item.label} · ${item.name} [${item.unit}]` + (item.note ? ` · ${item.note}` : "");
    parts.push(
      `<rect x="${PAD}" y="${y - 6}" width="${LEGEND_SWATCH}" height="3" rx="1" fill="${escapeXml(item.color)}"/>` +
        `<text x="${PAD + LEGEND_SWATCH + 8}" y="${y}" font-size="${TEXT_SIZE}" fill="${escapeXml(palette.ink)}">` +
        `${escapeXml(fitText(text, textWidth - LEGEND_SWATCH - 8, TEXT_SIZE))}</text>`,
    );
  }
  const headerHeight = y + PAD;
  const totalHeight = headerHeight + height;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalHeight}" ` +
    `viewBox="0 0 ${width} ${totalHeight}" font-family="${escapeXml(palette.fontFamily)}">` +
    `<rect width="100%" height="100%" fill="${escapeXml(palette.background)}"/>` +
    parts.join("") +
    `<g transform="translate(0 ${headerHeight})">${chart}</g>` +
    `</svg>`;
  return { svg, width, height: totalHeight };
}

/** Lo minimo de un canvas que usa este modulo. */
export interface CanvasLike {
  width: number;
  height: number;
  getContext(type: "2d"): {
    scale(x: number, y: number): void;
    drawImage(image: CanvasImageSource, x: number, y: number, w: number, h: number): void;
  } | null;
  toBlob(callback: (blob: Blob | null) => void, type: string): void;
}

export interface RasterEnvironment {
  loadImage(src: string): Promise<CanvasImageSource>;
  createCanvas(): CanvasLike;
}

/** Resolucion de la imagen respecto del grafico en pantalla: el doble, para
 *  que se lea bien impresa o en un informe. */
export const IMAGE_SCALE = 2;

export function svgDataUrl(svg: string): string {
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

/** Dibuja el SVG en un canvas y devuelve el PNG. */
export async function svgToPng(
  { svg, width, height }: ComposedImage,
  env: RasterEnvironment = browserRasterEnvironment(),
  scale = IMAGE_SCALE,
): Promise<Blob> {
  const image = await env.loadImage(svgDataUrl(svg));
  const canvas = env.createCanvas();
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("El navegador no pudo crear el canvas");
  context.scale(scale, scale);
  context.drawImage(image, 0, 0, width, height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) reject(new Error("El navegador no pudo generar el PNG"));
      else resolve(blob);
    }, "image/png");
  });
}

export interface SvgExportEnvironment extends RasterEnvironment {
  getStyle(node: StylableNode): StyleReader;
  serialize(node: StylableNode): string;
}

export interface SvgSource extends StylableNode {
  cloneNode(deep: boolean): unknown;
}

/** Los tres pasos: estilos, encabezado y PNG. */
export async function svgChartToPng(
  svg: SvgSource,
  size: { width: number; height: number },
  header: Omit<ComposeImageInput, "chart" | "width" | "height">,
  env: SvgExportEnvironment = browserSvgExportEnvironment(),
): Promise<Blob> {
  const clone = svg.cloneNode(true) as StylableNode;
  inlineComputedStyles(svg, clone, env.getStyle);
  const composed = composeImageSvg({ ...header, ...size, chart: env.serialize(clone) });
  return svgToPng(composed, env);
}

export function browserRasterEnvironment(): RasterEnvironment {
  return {
    loadImage: (src) =>
      new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("El navegador no pudo leer el SVG del grafico"));
        image.src = src;
      }),
    createCanvas: () => document.createElement("canvas"),
  };
}

export function browserSvgExportEnvironment(): SvgExportEnvironment {
  return {
    ...browserRasterEnvironment(),
    getStyle: (node) => window.getComputedStyle(node as unknown as Element),
    serialize: (node) => new XMLSerializer().serializeToString(node as unknown as Node),
  };
}
