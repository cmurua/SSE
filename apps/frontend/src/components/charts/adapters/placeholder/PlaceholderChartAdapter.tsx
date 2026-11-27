// Puerto de ChartPlaceholder.jsx (SVG a mano, sin dependencias). Sirve
// como implementacion por defecto y como referencia de contrato para
// cualquier adapter futuro (mismas props: ChartRendererProps).
//
// Los calculos (escalas, marcas, trazados) estan en geometry.ts; aca solo se
// dibuja. Los colores salen de clases de globals.css (chart-*, series-*), que
// usan los tokens: no hay colores en este archivo.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { seriesAt } from "../../series";
import type { ChartRendererProps } from "../../types";
import {
  computeTimeChart,
  computeXYChart,
  type TimeChartLayout,
  type XYChartLayout,
  type YAxisLayout,
} from "./geometry";

const DEFAULT_HEIGHT = 360;
/** Ancho antes de medir el contenedor (y en tests, donde no se mide). */
const DEFAULT_WIDTH = 800;
const MIN_WIDTH = 320;

/** Ancho del elemento, actualizado con ResizeObserver. */
function useElementWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);

  useEffect(() => {
    const element = ref.current;
    if (element === null || typeof ResizeObserver === "undefined") return;
    const update = (next: number) => setWidth(Math.max(MIN_WIDTH, Math.floor(next)));
    update(element.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) update(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}

export function PlaceholderChartAdapter({
  variables,
  data,
  mode,
  title,
  height = DEFAULT_HEIGHT,
  timeWindowMs,
  timeDomain,
}: ChartRendererProps) {
  const { t } = useTranslation("common");
  const [ref, width] = useElementWidth();
  const shown = variables.slice(0, 2);

  // `chart` es el SVG, o null si hay que mostrar un mensaje en su lugar.
  let chart: ReactNode = null;
  let message: ReactNode = null;
  let axisLabels: string[] = [];
  if (shown.length === 0) {
    message = <Message title={t("chart.empty.title")} lead={t("chart.empty.lead")} />;
  } else if (mode === "xy") {
    const layout =
      shown.length < 2 ? null : computeXYChart({ variables: shown, data, width, height, timeWindowMs });
    if (shown.length < 2) {
      message = <Message title={t("chart.xyNeedsTwo")} />;
    } else if (layout === null) {
      message = <Message title={t("chart.waiting")} />;
    } else {
      axisLabels = [t("chart.axisX"), t("chart.axisY")];
      chart = (
        <XYChart
          layout={layout}
          width={width}
          height={height}
          label={t("chart.ariaXY", { x: shown[0].name, y: shown[1].name })}
        />
      );
    }
  } else {
    const layout = computeTimeChart({ variables: shown, data, width, height, timeWindowMs, timeDomain });
    if (layout === null) {
      message = <Message title={t("chart.waiting")} />;
    } else {
      if (layout.yAxes.length === 2) axisLabels = [t("chart.axisLeft"), t("chart.axisRight")];
      chart = (
        <TimeChart
          layout={layout}
          width={width}
          height={height}
          label={t("chart.ariaTime", { names: shown.map((v) => v.name).join(", ") })}
          timeTitle={t("chart.timeAxis")}
        />
      );
    }
  }

  return (
    <div ref={ref} className="card overflow-hidden">
      {(title || shown.length > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3 border-b border-line">
          {title && <div className="text-sm font-semibold">{title}</div>}
          <div className="flex flex-wrap items-center gap-4">
            {shown.map((variable, index) => {
              const series = seriesAt(index);
              return (
                <div key={variable.id} className={"flex items-center gap-2 text-xs " + series?.className}>
                  <span className="w-3.5 h-[3px] rounded-sm series-dot" />
                  <span className="font-mono font-semibold series-text">{series?.label}</span>
                  <span className="font-medium">{variable.name}</span>
                  <span className="text-muted font-mono">[{variable.unit}]</span>
                  {axisLabels[index] && <span className="text-muted">{axisLabels[index]}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {/* Los mensajes ocupan el mismo alto que el grafico, para que la
          pagina no salte al llegar la primera muestra. Estilo inline porque
          el alto es una prop, no un valor fijo. */}
      {chart ?? <div style={{ height }}>{message}</div>}
    </div>
  );
}

function Message({ title, lead }: { title: string; lead?: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-8">
      <div className="text-base font-medium">{title}</div>
      {lead && <div className="text-sm text-muted mt-1">{lead}</div>}
    </div>
  );
}

function TimeChart({
  layout,
  width,
  height,
  label,
  timeTitle,
}: {
  layout: TimeChartLayout;
  width: number;
  height: number;
  label: string;
  timeTitle: string;
}) {
  // useId trae ":" (":r1:"), que no conviene dentro de url(#...).
  const clipId = "chart-clip-" + useId().replace(/:/g, "");
  const { plot, series, yAxes, xTicks } = layout;
  const bottom = plot.top + plot.height;
  const right = plot.left + plot.width;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <defs>
        <clipPath id={clipId}>
          <rect x={plot.left} y={plot.top} width={plot.width} height={plot.height} />
        </clipPath>
      </defs>

      <rect className="chart-bg" x={plot.left} y={plot.top} width={plot.width} height={plot.height} />
      {yAxes[0].ticks.map((tick) => (
        <line key={"gy" + tick.label} className="chart-grid" x1={plot.left} x2={right} y1={tick.y} y2={tick.y} />
      ))}
      {xTicks.map((tick) => (
        <line key={"gx" + tick.label} className="chart-grid" x1={tick.x} x2={tick.x} y1={plot.top} y2={bottom} />
      ))}

      <g clipPath={`url(#${clipId})`}>
        {series.map((s) => (
          <g key={s.id} className={seriesAt(s.index)?.className}>
            {/* El area solo con una variable: con dos se superponen y el
                azul y el ambar se mezclan en un gris que tapa las lineas. */}
            {s.area && series.length === 1 && <path className="series-area" d={s.area} />}
            {s.line && <path className="series-stroke" d={s.line} />}
            {s.dots.map((dot, i) => (
              <circle key={i} className="series-point" cx={dot.x} cy={dot.y} r={2.5} />
            ))}
          </g>
        ))}
      </g>

      {yAxes.map((axis) => (
        <YAxis key={axis.side} axis={axis} plot={plot} />
      ))}

      {xTicks.map((tick) => (
        <text key={"xt" + tick.label} className="chart-tick" x={tick.x} y={bottom + 16} textAnchor="middle">
          {tick.label}
        </text>
      ))}
      <text className="chart-axis-title" x={plot.left + plot.width / 2} y={bottom + 34} textAnchor="middle">
        {timeTitle}
      </text>
    </svg>
  );
}

function YAxis({ axis, plot }: { axis: YAxisLayout; plot: TimeChartLayout["plot"] }) {
  const left = axis.side === "left";
  const tickX = left ? plot.left - 8 : plot.left + plot.width + 8;
  const titleX = left ? 14 : plot.left + plot.width + 56;
  const titleY = plot.top + plot.height / 2;
  // Con dos ejes, cada uno lleva el color de su variable.
  const series = axis.seriesIndex === null ? null : seriesAt(axis.seriesIndex);
  const colored = series ? " series-tick" : "";

  return (
    <g className={series?.className}>
      {axis.ticks.map((tick) => (
        <text
          key={tick.label}
          className={"chart-tick" + colored}
          x={tickX}
          y={tick.y + 3.5}
          textAnchor={left ? "end" : "start"}
        >
          {tick.label}
        </text>
      ))}
      <text
        className={"chart-axis-title" + colored}
        x={titleX}
        y={titleY}
        textAnchor="middle"
        transform={`rotate(${left ? -90 : 90} ${titleX} ${titleY})`}
      >
        {axis.title}
      </text>
    </g>
  );
}

/** Variable B en funcion de la A. La trayectoria es de las dos variables y no
 *  de una, asi que va en un color neutro; el azul y el ambar quedan en los
 *  ejes, para leer cual es cual. */
function XYChart({
  layout,
  width,
  height,
  label,
}: {
  layout: XYChartLayout;
  width: number;
  height: number;
  label: string;
}) {
  const clipId = "chart-clip-" + useId().replace(/:/g, "");
  const { plot, xAxis, yAxis, current } = layout;
  const bottom = plot.top + plot.height;
  const right = plot.left + plot.width;
  const yTitleY = plot.top + plot.height / 2;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <defs>
        <clipPath id={clipId}>
          <rect x={plot.left} y={plot.top} width={plot.width} height={plot.height} />
        </clipPath>
      </defs>

      <rect className="chart-bg" x={plot.left} y={plot.top} width={plot.width} height={plot.height} />
      {yAxis.ticks.map((tick) => (
        <line key={"gy" + tick.label} className="chart-grid" x1={plot.left} x2={right} y1={tick.at} y2={tick.at} />
      ))}
      {xAxis.ticks.map((tick) => (
        <line key={"gx" + tick.label} className="chart-grid" x1={tick.at} x2={tick.at} y1={plot.top} y2={bottom} />
      ))}

      <g clipPath={`url(#${clipId})`}>
        {layout.line && <path className="chart-trajectory" d={layout.line} />}
        {layout.dots.map((dot, i) => (
          <circle key={i} className="chart-trajectory-point" cx={dot.x} cy={dot.y} r={2} />
        ))}
        <circle className="chart-current" cx={current.x} cy={current.y} r={4.5} />
      </g>

      {/* Eje X: Variable A */}
      <g className={seriesAt(0)?.className}>
        {xAxis.ticks.map((tick) => (
          <text key={"xt" + tick.label} className="chart-tick series-tick" x={tick.at} y={bottom + 16} textAnchor="middle">
            {tick.label}
          </text>
        ))}
        <text className="chart-axis-title series-tick" x={plot.left + plot.width / 2} y={bottom + 34} textAnchor="middle">
          {xAxis.title}
        </text>
      </g>

      {/* Eje Y: Variable B */}
      <g className={seriesAt(1)?.className}>
        {yAxis.ticks.map((tick) => (
          <text key={"yt" + tick.label} className="chart-tick series-tick" x={plot.left - 8} y={tick.at + 3.5} textAnchor="end">
            {tick.label}
          </text>
        ))}
        <text
          className="chart-axis-title series-tick"
          x={14}
          y={yTitleY}
          textAnchor="middle"
          transform={`rotate(-90 14 ${yTitleY})`}
        >
          {yAxis.title}
        </text>
      </g>
    </svg>
  );
}
