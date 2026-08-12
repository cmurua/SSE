// ChartPlaceholder — vendor-agnostic placeholder.
// Props: variables [VarDef], data {varId: [{t,v}]}, mode "time"|"xy", title, height
const ChartPlaceholder = ({ variables = [], data = {}, mode = "time", title, height = 360, showLegend = true, showAxes = true }) => {
  const PADDING = { top: 20, right: 24, bottom: 38, left: 56 };
  const W_RATIO = 16 / 9;
  const containerRef = React.useRef(null);
  const [w, setW] = React.useState(800);

  React.useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setW(Math.max(320, e.contentRect.width));
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const h = height;
  const innerW = w - PADDING.left - PADDING.right;
  const innerH = h - PADDING.top - PADDING.bottom;

  // Pick stroke colors per variable
  const COLORS = ["#2f6fb5", "#b27a13"];

  // Compute series in (x,y) space depending on mode
  const series = variables.slice(0, 2).map((v, i) => {
    const points = data[v.id] || [];
    if (mode === "time") {
      const ys = points.map(p => p.v);
      const xs = points.map(p => p.t);
      return { v, color: COLORS[i], xs, ys };
    }
    return { v, color: COLORS[i], pts: points };
  });

  let xMin, xMax, yMinA, yMaxA, yMinB, yMaxB;
  if (mode === "time") {
    const all = series.flatMap(s => s.xs || []);
    xMin = all.length ? Math.min(...all) : 0;
    xMax = all.length ? Math.max(...all) : 100;
    if (series[0]) { yMinA = Math.min(...series[0].ys); yMaxA = Math.max(...series[0].ys); }
    if (series[1]) { yMinB = Math.min(...series[1].ys); yMaxB = Math.max(...series[1].ys); }
  } else {
    // XY mode: variable A on X, variable B on Y, use min count
    if (variables.length === 2) {
      const a = data[variables[0].id] || [];
      const b = data[variables[1].id] || [];
      const n = Math.min(a.length, b.length);
      const xs = a.slice(0, n).map(p => p.v);
      const ys = b.slice(0, n).map(p => p.v);
      xMin = Math.min(...xs); xMax = Math.max(...xs);
      yMinA = Math.min(...ys); yMaxA = Math.max(...ys);
      series.length = 1;
      series[0] = { v: variables[1], vx: variables[0], color: COLORS[0], xs, ys };
    }
  }

  const padR = (lo, hi) => {
    if (lo === hi) return [lo - 1, hi + 1];
    const p = (hi - lo) * 0.08;
    return [lo - p, hi + p];
  };

  const fmt = (n) => {
    if (n === undefined || n === null || isNaN(n)) return "—";
    const a = Math.abs(n);
    if (a >= 1000 && a < 1e6) return n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
    if (a >= 1e6) return n.toExponential(2);
    if (a < 0.01 && a > 0) return n.toExponential(2);
    return n.toFixed(2);
  };

  const xToPx = (x, lo, hi) => PADDING.left + ((x - lo) / (hi - lo)) * innerW;
  const yToPx = (y, lo, hi) => PADDING.top + innerH - ((y - lo) / (hi - lo)) * innerH;

  // Build paths
  let paths = [];
  if (mode === "time") {
    const [x0, x1] = padR(xMin, xMax);
    series.forEach((s, idx) => {
      if (!s.xs || !s.xs.length) return;
      const lo = idx === 0 ? yMinA : yMinB;
      const hi = idx === 0 ? yMaxA : yMaxB;
      const [y0, y1] = padR(lo, hi);
      let dStr = "";
      let aStr = `M ${xToPx(s.xs[0], x0, x1)} ${PADDING.top + innerH} `;
      s.xs.forEach((x, i) => {
        const px = xToPx(x, x0, x1);
        const py = yToPx(s.ys[i], y0, y1);
        dStr += (i === 0 ? "M" : "L") + " " + px.toFixed(1) + " " + py.toFixed(1) + " ";
        aStr += "L " + px.toFixed(1) + " " + py.toFixed(1) + " ";
      });
      aStr += `L ${xToPx(s.xs[s.xs.length-1], x0, x1)} ${PADDING.top + innerH} Z`;
      paths.push({ d: dStr, area: aStr, color: s.color, label: s.v.name, unit: s.v.unit, lo, hi, y0, y1 });
    });
  } else if (series[0]) {
    const s = series[0];
    const [x0, x1] = padR(xMin, xMax);
    const [y0, y1] = padR(yMinA, yMaxA);
    let dStr = "";
    s.xs.forEach((x, i) => {
      const px = xToPx(x, x0, x1);
      const py = yToPx(s.ys[i], y0, y1);
      dStr += (i === 0 ? "M" : "L") + " " + px.toFixed(1) + " " + py.toFixed(1) + " ";
    });
    paths.push({ d: dStr, color: s.color, label: s.v.name, unit: s.v.unit, lo: yMinA, hi: yMaxA, y0, y1, x0, x1, vx: s.vx });
  }

  // Empty state
  if (variables.length === 0) {
    return (
      <div ref={containerRef} className="card" style={{ height: h }}>
        <div className="h-full flex flex-col items-center justify-center text-center px-8">
          <div className="text-muted text-sm font-mono mb-2">CHART · placeholder</div>
          <div className="text-base font-medium text-[var(--ink)]">Seleccione una variable</div>
          <div className="text-sm text-muted mt-1">Hasta 2 variables simultáneamente. Modo {mode === "time" ? "tiempo" : "X · Y"}.</div>
        </div>
      </div>
    );
  }

  // Y-axis ticks (5)
  const ticks = (lo, hi, n = 5) => {
    const out = [];
    for (let i = 0; i <= n; i++) out.push(lo + (hi - lo) * (i / n));
    return out;
  };
  const xTicksN = 6;

  return (
    <div ref={containerRef} className="card overflow-hidden">
      {/* header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-line">
        <div className="flex items-center gap-3">
          <div className="text-xs font-mono text-muted">CHART · placeholder</div>
          {title && <div className="text-sm font-semibold">{title}</div>}
        </div>
        {showLegend && (
          <div className="flex items-center gap-4">
            {paths.map((p, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span style={{ width: 14, height: 3, background: p.color, display: "inline-block", borderRadius: 2 }} />
                <span className="text-[var(--ink)] font-medium">{p.label}</span>
                <span className="text-muted font-mono">[{p.unit}]</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* chart svg */}
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        {/* plot bg */}
        <rect x={PADDING.left} y={PADDING.top} width={innerW} height={innerH} fill="#fafbfc" />
        {/* grid */}
        {showAxes && Array.from({ length: 6 }).map((_, i) => {
          const y = PADDING.top + (innerH / 5) * i;
          return <line key={"gh"+i} x1={PADDING.left} x2={PADDING.left + innerW} y1={y} y2={y} stroke="#e3e5e8" strokeWidth="1" />;
        })}
        {showAxes && Array.from({ length: xTicksN + 1 }).map((_, i) => {
          const x = PADDING.left + (innerW / xTicksN) * i;
          return <line key={"gv"+i} x1={x} x2={x} y1={PADDING.top} y2={PADDING.top + innerH} stroke="#eef0f2" strokeWidth="1" />;
        })}

        {/* areas + lines */}
        {paths.map((p, i) => (
          <g key={i}>
            {p.area && <path d={p.area} fill={p.color} fillOpacity="0.12" />}
            <path d={p.d} fill="none" stroke={p.color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
          </g>
        ))}

        {/* axes labels */}
        {showAxes && mode === "time" && paths[0] && (() => {
          const p = paths[0];
          const ys = ticks(p.y0, p.y1, 5);
          return ys.map((yv, i) => {
            const py = yToPx(yv, p.y0, p.y1);
            return (
              <text key={"ya"+i} x={PADDING.left - 8} y={py + 4} textAnchor="end" fontSize="10" fill="#6c7176" fontFamily="JetBrains Mono, monospace">
                {fmt(yv)}
              </text>
            );
          });
        })()}
        {showAxes && mode === "time" && paths[1] && (() => {
          const p = paths[1];
          const ys = ticks(p.y0, p.y1, 5);
          return ys.map((yv, i) => {
            const py = yToPx(yv, p.y0, p.y1);
            return (
              <text key={"yb"+i} x={PADDING.left + innerW + 8} y={py + 4} textAnchor="start" fontSize="10" fill={paths[1].color} fontFamily="JetBrains Mono, monospace">
                {fmt(yv)}
              </text>
            );
          });
        })()}
        {showAxes && mode === "xy" && paths[0] && (() => {
          const p = paths[0];
          const ys = ticks(p.y0, p.y1, 5);
          return ys.map((yv, i) => {
            const py = yToPx(yv, p.y0, p.y1);
            return (
              <text key={"yxy"+i} x={PADDING.left - 8} y={py + 4} textAnchor="end" fontSize="10" fill="#6c7176" fontFamily="JetBrains Mono, monospace">
                {fmt(yv)}
              </text>
            );
          });
        })()}
        {/* X axis tick labels */}
        {showAxes && (() => {
          let lo, hi, label;
          if (mode === "time") { lo = xMin; hi = xMax; label = "Tiempo (s)"; }
          else if (paths[0]) { lo = paths[0].x0; hi = paths[0].x1; label = `${paths[0].vx?.name || ""} [${paths[0].vx?.unit || ""}]`; }
          if (lo === undefined) return null;
          const out = [];
          for (let i = 0; i <= xTicksN; i++) {
            const x = PADDING.left + (innerW / xTicksN) * i;
            const xv = lo + ((hi - lo) * i) / xTicksN;
            out.push(<text key={"xt"+i} x={x} y={PADDING.top + innerH + 16} textAnchor="middle" fontSize="10" fill="#6c7176" fontFamily="JetBrains Mono, monospace">{fmt(xv)}</text>);
          }
          out.push(<text key="xlbl" x={PADDING.left + innerW / 2} y={PADDING.top + innerH + 32} textAnchor="middle" fontSize="11" fill="#3a3d42">{label}</text>);
          return out;
        })()}
        {/* Y axis label */}
        {showAxes && paths[0] && (
          <text x={14} y={PADDING.top + innerH / 2} fontSize="11" fill="#3a3d42"
                transform={`rotate(-90 14 ${PADDING.top + innerH / 2})`} textAnchor="middle">
            {mode === "time" ? `${paths[0].label} [${paths[0].unit}]` : `${paths[0].label} [${paths[0].unit}]`}
          </text>
        )}
      </svg>
    </div>
  );
};

window.ChartPlaceholder = ChartPlaceholder;
