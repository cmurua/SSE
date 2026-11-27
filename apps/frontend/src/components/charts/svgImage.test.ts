// Exportar el grafico a PNG (tarea 5.8). Los tests corren en Node, sin DOM
// ni canvas: el DOM y el canvas son falsos y lo que se prueba es lo que hace
// este modulo con ellos (estilos copiados, encabezado, tamano, tipo PNG).
// Que el navegador dibuje bien el SVG en el canvas no se puede probar aca.
import { describe, expect, it, vi } from "vitest";
import {
  composeImageSvg,
  escapeXml,
  fitText,
  IMAGE_SCALE,
  inlineComputedStyles,
  svgChartToPng,
  svgDataUrl,
  svgToPng,
  type CanvasLike,
  type StylableNode,
  type SvgExportEnvironment,
} from "./svgImage";

/** Nodo falso: guarda los atributos y las clases. */
class FakeNode implements StylableNode {
  attributes: Record<string, string> = {};
  constructor(
    public className: string,
    public children: FakeNode[] = [],
  ) {}
  setAttribute(name: string, value: string) {
    this.attributes[name] = value;
  }
  cloneNode(): FakeNode {
    return new FakeNode(
      this.className,
      this.children.map((c) => c.cloneNode()),
    );
  }
}

/** Estilos "calculados" segun la clase, como los resolveria el navegador. */
const COMPUTED: Record<string, Record<string, string>> = {
  root: { "font-family": "Inter, sans-serif" },
  "chart-grid": { stroke: "rgb(220, 220, 220)", "stroke-width": "1px" },
  "series-stroke": { fill: "none", stroke: "rgb(31, 111, 181)", "stroke-width": "1.8px" },
  empty: {},
};

const getStyle = (node: StylableNode) => ({
  getPropertyValue: (property: string) => COMPUTED[(node as FakeNode).className]?.[property] ?? "",
});

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function fakeCanvas() {
  const context = { scale: vi.fn(), drawImage: vi.fn() };
  const canvas: CanvasLike & { type?: string } = {
    width: 0,
    height: 0,
    getContext: () => context,
    toBlob(callback, type) {
      canvas.type = type;
      callback(new Blob([PNG_SIGNATURE], { type }));
    },
  };
  return { canvas, context };
}

const PALETTE = { background: "#fff", ink: "#111", muted: "#777", fontFamily: "Inter" };

describe("inlineComputedStyles", () => {
  it("copia al clon los estilos calculados de cada elemento", () => {
    const source = new FakeNode("root", [
      new FakeNode("chart-grid"),
      new FakeNode("empty", [new FakeNode("series-stroke")]),
    ]);
    const clone = source.cloneNode();

    inlineComputedStyles(source, clone, getStyle);

    expect(clone.attributes.style).toBe("font-family:Inter, sans-serif");
    expect(clone.children[0].attributes.style).toBe("stroke:rgb(220, 220, 220);stroke-width:1px");
    // Sin estilos propios no se agrega un style vacio.
    expect(clone.children[1].attributes.style).toBeUndefined();
    expect(clone.children[1].children[0].attributes.style).toBe(
      "fill:none;stroke:rgb(31, 111, 181);stroke-width:1.8px",
    );
    // El original no se toca.
    expect(source.attributes).toEqual({});
  });
});

describe("composeImageSvg", () => {
  const base = {
    chart: '<svg width="600" height="300"><path d="M0 0"/></svg>',
    width: 600,
    height: 300,
    title: "Operacion OP-2025-001 · Practica",
    legend: [],
    palette: PALETTE,
  };

  it("lleva titulo, subtitulo, leyenda y el grafico debajo", () => {
    const { svg, width, height } = composeImageSvg({
      ...base,
      subtitle: "Ventana 5–90 min",
      legend: [
        { label: "A", name: "Logaritmico de Arranque 1", unit: "c/s", color: "rgb(1, 2, 3)" },
        { label: "B", name: "Potencia", unit: "W", note: "eje der.", color: "rgb(4, 5, 6)" },
      ],
    });

    expect(width).toBe(600);
    expect(height).toBeGreaterThan(300);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="600"/);
    expect(svg).toContain(">Operacion OP-2025-001 · Practica</text>");
    expect(svg).toContain(">Ventana 5–90 min</text>");
    expect(svg).toContain(">A · Logaritmico de Arranque 1 [c/s]</text>");
    expect(svg).toContain('fill="rgb(1, 2, 3)"');
    expect(svg).toContain(">B · Potencia [W] · eje der.</text>");
    // El grafico va desplazado debajo del encabezado.
    expect(svg).toContain(`<g transform="translate(0 ${height - 300})">${base.chart}</g>`);
    // Fondo opaco: un PNG transparente se ve mal en un documento oscuro.
    expect(svg).toContain('<rect width="100%" height="100%" fill="#fff"/>');
  });

  it("cada linea agrega alto al encabezado", () => {
    const solo = composeImageSvg(base).height;
    const conSubtitulo = composeImageSvg({ ...base, subtitle: "x" }).height;
    expect(conSubtitulo).toBeGreaterThan(solo);
  });

  it("escapa el texto del usuario", () => {
    const { svg } = composeImageSvg({ ...base, title: 'Op <1> & "2"' });
    expect(svg).toContain(">Op &lt;1&gt; &amp; &quot;2&quot;</text>");
  });
});

describe("fitText y escapeXml", () => {
  it("recorta con puntos suspensivos lo que no entra", () => {
    expect(fitText("corto", 600, 12)).toBe("corto");
    const long = "x".repeat(500);
    const fitted = fitText(long, 300, 12);
    expect(fitted.endsWith("…")).toBe(true);
    expect(fitted.length).toBeLessThan(long.length);
  });

  it("escapa los cinco caracteres de XML", () => {
    expect(escapeXml(`<a & 'b' "c">`)).toBe("&lt;a &amp; &apos;b&apos; &quot;c&quot;&gt;");
  });
});

describe("svgToPng", () => {
  it("dibuja el SVG al doble de resolucion y devuelve un PNG", async () => {
    const { canvas, context } = fakeCanvas();
    const image = { fake: "image" } as unknown as CanvasImageSource;
    const loadImage = vi.fn().mockResolvedValue(image);

    const blob = await svgToPng(
      { svg: "<svg/>", width: 600, height: 400 },
      { loadImage, createCanvas: () => canvas },
    );

    expect(loadImage).toHaveBeenCalledWith(svgDataUrl("<svg/>"));
    expect(canvas.width).toBe(600 * IMAGE_SCALE);
    expect(canvas.height).toBe(400 * IMAGE_SCALE);
    expect(context.scale).toHaveBeenCalledWith(IMAGE_SCALE, IMAGE_SCALE);
    expect(context.drawImage).toHaveBeenCalledWith(image, 0, 0, 600, 400);
    expect(canvas.type).toBe("image/png");
    expect(blob.type).toBe("image/png");
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(PNG_SIGNATURE);
  });

  it("rechaza si el canvas no genera el archivo", async () => {
    const { canvas } = fakeCanvas();
    canvas.toBlob = (callback) => callback(null);
    await expect(
      svgToPng(
        { svg: "<svg/>", width: 10, height: 10 },
        { loadImage: async () => ({}) as CanvasImageSource, createCanvas: () => canvas },
      ),
    ).rejects.toThrow("PNG");
  });

  it("rechaza si el navegador no puede leer el SVG", async () => {
    const { canvas } = fakeCanvas();
    await expect(
      svgToPng(
        { svg: "<svg/>", width: 10, height: 10 },
        { loadImage: () => Promise.reject(new Error("svg roto")), createCanvas: () => canvas },
      ),
    ).rejects.toThrow("svg roto");
  });
});

describe("svgChartToPng", () => {
  it("de un <svg> con clases a un PNG con los estilos copiados y el encabezado", async () => {
    const svg = new FakeNode("root", [new FakeNode("series-stroke")]);
    const { canvas } = fakeCanvas();
    let drawn = "";
    const env: SvgExportEnvironment = {
      getStyle,
      // Serializacion minima: alcanza para ver que llego el clon con estilos.
      serialize: (node) =>
        `<svg style="${(node as FakeNode).attributes.style}">` +
        `<path style="${(node as FakeNode).children[0].attributes.style}"/></svg>`,
      loadImage: async (src) => {
        drawn = decodeURIComponent(src.slice(src.indexOf(",") + 1));
        return {} as CanvasImageSource;
      },
      createCanvas: () => canvas,
    };

    const blob = await svgChartToPng(
      svg,
      { width: 800, height: 360 },
      {
        title: "Operacion OP-1",
        subtitle: "POTM4",
        legend: [{ label: "A", name: "Potencia", unit: "W", color: "rgb(31, 111, 181)" }],
        palette: PALETTE,
      },
      env,
    );

    expect(blob.type).toBe("image/png");
    expect(drawn).toContain(">Operacion OP-1</text>");
    expect(drawn).toContain('<path style="fill:none;stroke:rgb(31, 111, 181);stroke-width:1.8px"/>');
    expect(canvas.width).toBe(800 * IMAGE_SCALE);
    expect(svg.attributes).toEqual({});
  });
});
