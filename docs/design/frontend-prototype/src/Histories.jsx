// Histories: list view + detail view (XY/time chart against historic data)
const Histories = ({ initialOp, onNav }) => {
  const L = window.LABELS.histories;
  const [openOp, setOpenOp] = React.useState(initialOp || null);
  const [from, setFrom] = React.useState("2026-03-01");
  const [to, setTo] = React.useState("2026-04-30");
  const [opId, setOpId] = React.useState("");

  const filtered = window.OPERATIONS.filter(op => {
    if (opId && !op.id.toLowerCase().includes(opId.toLowerCase()) && !op.name.toLowerCase().includes(opId.toLowerCase())) return false;
    if (from && op.date < from) return false;
    if (to && op.date > to) return false;
    return true;
  });

  if (openOp) return <HistoryDetail op={openOp} onBack={() => setOpenOp(null)} />;

  return (
    <div className="space-y-5">
      <div className="banner">{window.LABELS.histories.listTitle}</div>

      <div className="grid grid-cols-12 gap-5">
        {/* Filters */}
        <aside className="col-span-12 lg:col-span-3 card card-pad self-start">
          <div className="flex items-center gap-2 mb-4">
            <window.IFilter size={15} />
            <div className="font-semibold text-[14px]">{L.filters}</div>
          </div>
          <label className="label-text">{L.from}</label>
          <input type="date" className="field mb-3" value={from} onChange={(e) => setFrom(e.target.value)} />
          <label className="label-text">{L.to}</label>
          <input type="date" className="field mb-3" value={to} onChange={(e) => setTo(e.target.value)} />
          <label className="label-text">{L.operationId}</label>
          <input className="field mb-4" placeholder="OP-… o nombre" value={opId} onChange={(e) => setOpId(e.target.value)} />

          <div className="flex items-center gap-2">
            <button className="btn-dark flex-1">{L.apply}</button>
            <button className="btn-ghost" onClick={() => { setFrom(""); setTo(""); setOpId(""); }}>{L.clear}</button>
          </div>

          <div className="mt-5 pt-4 border-t border-line text-[11px] text-muted">
            <div>Mostrando <span className="font-mono text-[var(--ink)]">{filtered.length}</span> de <span className="font-mono">{window.OPERATIONS.length}</span> operaciones.</div>
          </div>
        </aside>

        {/* List */}
        <section className="col-span-12 lg:col-span-9 card overflow-hidden">
          <div className="grid grid-cols-12 gap-4 px-5 py-3 bg-[#f7f8f9] border-b border-line text-[11px] uppercase tracking-widest text-muted font-mono">
            <div className="col-span-2">ID</div>
            <div className="col-span-4">Operación</div>
            <div className="col-span-2">Fecha</div>
            <div className="col-span-2">Operador</div>
            <div className="col-span-1 text-right">Muestras</div>
            <div className="col-span-1"></div>
          </div>
          {filtered.length === 0 && (
            <div className="px-5 py-12 text-center text-muted text-[13px]">{L.empty}</div>
          )}
          {filtered.map(op => (
            <div key={op.id} className="grid grid-cols-12 gap-4 px-5 py-4 border-b border-line items-center hover:bg-[#fafbfc]">
              <div className="col-span-2 font-mono text-[12px] font-medium">{op.id}</div>
              <div className="col-span-4 min-w-0">
                <div className="text-[14px] font-semibold truncate">{op.name}</div>
                <div className="text-[12px] text-muted truncate">{op.notes}</div>
              </div>
              <div className="col-span-2 font-mono text-[12px]">
                {op.date}
                <div className="text-[10px] text-muted">{fmtDur(op.durationMin)}</div>
              </div>
              <div className="col-span-2 text-[12px]">{op.operator}</div>
              <div className="col-span-1 text-right font-mono text-[12px]">{op.samples.toLocaleString("es-AR")}</div>
              <div className="col-span-1 text-right">
                <button onClick={() => setOpenOp(op)} className="btn-dark !py-1.5 !px-3 !text-[11px]">{L.open}</button>
              </div>
            </div>
          ))}

          {/* Pagination */}
          {filtered.length > 0 && (
            <div className="flex items-center justify-between px-5 py-3 text-[12px] text-muted">
              <div>{L.page} 1 {L.of} 1</div>
              <div className="flex items-center gap-1">
                {[1, 2, 3].map(n => (
                  <button key={n} className={"w-7 h-7 rounded-md text-[12px] " + (n === 1 ? "bg-[var(--ink)] text-white" : "hover:bg-[#f3f4f5]")}>{n}</button>
                ))}
                <span className="px-1">…</span>
                <button className="w-7 h-7 rounded-md text-[12px] hover:bg-[#f3f4f5]">10</button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

const HistoryDetail = ({ op, onBack }) => {
  const L = window.LABELS;
  const [selected, setSelected] = React.useState(["POT_NUC", "POS_BR1"]);
  const [mode, setMode] = React.useState("time");
  // Time window in minutes: [winStart, winEnd]
  const [winStart, setWinStart] = React.useState(0);
  const [winEnd, setWinEnd]     = React.useState(op.durationMin);
  // playhead (in minutes) for the snapshot/control-bars view; defaults to end of window
  const [playhead, setPlayhead] = React.useState(op.durationMin);
  const [playing, setPlaying]   = React.useState(false);

  // Build a fixed historic series — one point per minute (op.durationMin samples).
  const data = React.useMemo(() => {
    const out = {};
    window.VARIABLES.forEach(v => {
      out[v.id] = window.generateSeries(v, op.durationMin, 0);
    });
    return out;
  }, [op.id]);

  // Slice data by [winStart, playhead] — chart is drawn progressively like a video.
  const sliced = React.useMemo(() => {
    const lo = Math.max(0, Math.floor(winStart));
    const hi = Math.max(lo + 1, Math.min(op.durationMin, Math.ceil(playhead)));
    const out = {};
    Object.keys(data).forEach(k => { out[k] = data[k].slice(lo, hi); });
    return out;
  }, [data, winStart, playhead, op.durationMin]);

  // Reset window/playhead when operation changes
  React.useEffect(() => {
    setWinStart(0);
    setWinEnd(op.durationMin);
    setPlayhead(0);
  }, [op.id]);

  // Clamp playhead inside window; when window changes, snap playhead back to start.
  React.useEffect(() => {
    setPlayhead(p => Math.max(winStart, Math.min(winEnd, p)));
  }, [winStart, winEnd]);

  React.useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setPlayhead(p => {
        if (p >= winEnd) { setPlaying(false); return winEnd; }
        return Math.min(winEnd, p + 1);
      });
    }, 100);
    return () => clearInterval(id);
  }, [playing, winEnd]);

  const toggleVar = (id) => {
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  const selectedDefs = selected.map(id => window.VARIABLES.find(v => v.id === id)).filter(Boolean);
  const selectedData = {};
  selected.forEach(id => { selectedData[id] = sliced[id] || []; });

  // Snapshot at playhead for ControlBarsPanel
  const phSnapshot = React.useMemo(() => {
    const idx = Math.max(0, Math.min(op.durationMin - 1, Math.floor(playhead)));
    const out = {};
    ["POS_BR1", "POS_BR2", "POS_BR3", "POS_BR4", "POS_BRS", "NIV_MOD"].forEach(id => {
      const arr = data[id];
      if (arr && arr[idx]) out[id] = arr[idx].v;
    });
    return out;
  }, [data, playhead, op.durationMin]);

  const windowSamples = Math.max(0, Math.floor((winEnd - winStart)) * (op.samples / Math.max(1, op.durationMin)));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="btn-ghost flex items-center gap-1.5">
          <window.IChevronL size={12} /> Volver al listado
        </button>
        <div className="banner flex-1">{L.histories.detailPrefix} {op.id} · {op.date}</div>
      </div>

      <div className="card grid grid-cols-2 md:grid-cols-5 divide-x divide-line overflow-hidden">
        <StatTile label="Operación" value={op.name} />
        <StatTile label="Operador" value={op.operator} />
        <StatTile label={L.histories.duration} value={fmtDur(op.durationMin)} mono />
        <StatTile label={L.histories.samples} value={op.samples.toLocaleString("es-AR")} mono />
        <StatTile label="Notas" value={op.notes} />
      </div>

      {/* Control bars snapshot at playhead */}
      <window.ControlBarsPanel snapshot={phSnapshot} />

      <div className="grid grid-cols-12 gap-5">
        {/* Sidebar */}
        <aside className="col-span-12 lg:col-span-4 xl:col-span-3 card self-start">
          <div className="px-4 py-3 border-b border-line">
            <div className="font-semibold text-[14px]">{L.realtime.chooseVariables}</div>
            <div className="text-[11px] text-muted mt-0.5">{L.realtime.chooseVarsHint}</div>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: 460 }}>
            {window.VARIABLES.map(v => {
              const isSel = selected.includes(v.id);
              const colorIdx = selected.indexOf(v.id);
              const color = colorIdx >= 0 ? ["#2f6fb5", "#b27a13"][colorIdx] : null;
              return (
                <button key={v.id} onClick={() => toggleVar(v.id)}
                        className={"w-full text-left px-4 py-2.5 flex items-center gap-2 border-b border-line hover:bg-[#f7f8f9] " + (isSel ? "bg-[#f7f8f9]" : "")}>
                  <span className={"w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 " + (isSel ? "" : "border-line-2")}
                        style={isSel ? { background: color, borderColor: color } : {}}>
                    {isSel && <window.ICheck size={9} className="text-white" strokeWidth={3} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium truncate">{v.name}</div>
                    <div className="text-[10px] text-muted font-mono">{v.id} · {v.unit}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Chart + window controls */}
        <section className="col-span-12 lg:col-span-8 xl:col-span-9 space-y-4">
          <div className="card flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="flex items-center gap-1 bg-[#f3f4f5] rounded-full p-1">
              <button onClick={() => setMode("time")}
                      className={"px-3 py-1 text-[12px] rounded-full font-medium " + (mode === "time" ? "bg-white shadow-sm text-[var(--ink)]" : "text-muted")}>
                {L.realtime.modeTime}
              </button>
              <button onClick={() => setMode("xy")} disabled={selected.length < 2}
                      className={"px-3 py-1 text-[12px] rounded-full font-medium " + (mode === "xy" ? "bg-white shadow-sm text-[var(--ink)]" : "text-muted disabled:opacity-40")}>
                {L.realtime.modeXY}
              </button>
            </div>
            <span className="font-mono text-[11px] text-muted">
              ventana <span className="text-[var(--ink)]">{Math.floor(winStart)}</span> – <span className="text-[var(--ink)]">{Math.ceil(winEnd)}</span> min
              <span className="ml-2">({Math.ceil(winEnd - winStart)} min · {Math.round(windowSamples).toLocaleString("es-AR")} muestras)</span>
            </span>
            <div className="ml-auto flex items-center gap-2">
              <button className="btn-ghost flex items-center gap-1.5"><window.IDownload size={11} />Exportar tabla</button>
              <button className="btn-dark flex items-center gap-1.5"><window.IDownload size={12} />{L.realtime.export}</button>
            </div>
          </div>

          <ChartPlaceholder
            variables={selectedDefs}
            data={selectedData}
            mode={mode}
            title={`${op.id} — ${mode === "time" ? "Variable vs Tiempo" : "Variable vs Variable"} · t = ${Math.floor(playhead)} / ${Math.ceil(winEnd)} min`}
            height={380}
          />

          {/* Time-window selector */}
          <div className="card card-pad">
            <div className="flex items-center gap-2 mb-3">
              <window.IFilter size={14} className="text-muted" />
              <div className="font-semibold text-[13px]">Ventana de análisis</div>
              <div className="text-[11px] text-muted">— configure los límites; el gráfico se dibuja como video desde el inicio hasta el cursor</div>
            </div>

            <div className="grid grid-cols-12 gap-4 items-end">
              <NumberInput label="Inicio (min)" value={winStart} min={0} max={winEnd - 1}
                           onChange={(v) => setWinStart(Math.max(0, Math.min(winEnd - 1, v)))}
                           className="col-span-6 md:col-span-2" />
              <NumberInput label="Fin (min)" value={winEnd} min={winStart + 1} max={op.durationMin}
                           onChange={(v) => setWinEnd(Math.max(winStart + 1, Math.min(op.durationMin, v)))}
                           className="col-span-6 md:col-span-2" />

              {/* Dual-range track */}
              <div className="col-span-12 md:col-span-8">
                <label className="label-text">Rango</label>
                <DualRange min={0} max={op.durationMin} a={winStart} b={winEnd}
                           playhead={playhead}
                           onChange={(a, b) => { setWinStart(a); setWinEnd(b); }} />
                <div className="flex justify-between mt-1 text-[10px] text-muted font-mono">
                  <span>00:00</span>
                  <span>{fmtDur(Math.floor(op.durationMin / 4))}</span>
                  <span>{fmtDur(Math.floor(op.durationMin / 2))}</span>
                  <span>{fmtDur(Math.floor(3 * op.durationMin / 4))}</span>
                  <span>{fmtDur(op.durationMin)}</span>
                </div>
              </div>
            </div>

            {/* Playhead controls */}
            <div className="mt-4 pt-4 border-t border-line flex items-center gap-3">
              <button onClick={() => { if (playhead >= winEnd) setPlayhead(winStart); setPlaying(p => !p); }}
                      className="w-8 h-8 rounded-full bg-[var(--ink)] text-white flex items-center justify-center">
                {playing ? <window.IPause size={12} /> : <window.IPlay size={11} />}
              </button>
              <button onClick={() => { setPlayhead(winStart); setPlaying(false); }}
                      className="btn-ghost !py-1 !px-2.5 !text-[11px]">Reiniciar</button>
              <input type="range" min={winStart} max={winEnd} step="1"
                     value={Math.max(winStart, Math.min(winEnd, playhead))}
                     onChange={(e) => setPlayhead(Number(e.target.value))}
                     className="flex-1" />
              <div className="font-mono text-[11px] text-muted whitespace-nowrap">
                cursor = <span className="text-[var(--ink)]">{Math.floor(playhead)} min</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

// Number input with label
const NumberInput = ({ label, value, min, max, onChange, className = "" }) => (
  <div className={className}>
    <label className="label-text">{label}</label>
    <input type="number" min={min} max={max} value={Math.round(value)}
           onChange={(e) => onChange(Number(e.target.value))}
           className="field !py-2 font-mono text-[13px]" />
  </div>
);

// DualRange: two thumbs over a single track, drag a handle to set start/end.
const DualRange = ({ min, max, a, b, playhead, onChange }) => {
  const trackRef = React.useRef(null);
  const [drag, setDrag] = React.useState(null); // 'a' | 'b' | null
  const pctA = ((a - min) / (max - min)) * 100;
  const pctB = ((b - min) / (max - min)) * 100;
  const pctP = ((playhead - min) / (max - min)) * 100;

  React.useEffect(() => {
    if (!drag) return;
    const onMove = (e) => {
      if (!trackRef.current) return;
      const r = trackRef.current.getBoundingClientRect();
      const cx = e.touches ? e.touches[0].clientX : e.clientX;
      const pct = Math.max(0, Math.min(1, (cx - r.left) / r.width));
      const val = min + pct * (max - min);
      if (drag === "a") onChange(Math.min(b - 1, Math.max(min, val)), b);
      else              onChange(a, Math.max(a + 1, Math.min(max, val)));
    };
    const onUp = () => setDrag(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove);
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [drag, a, b, min, max, onChange]);

  return (
    <div ref={trackRef} className="relative h-8 select-none touch-none">
      {/* track */}
      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-[#e3e5e8]" />
      {/* selected band */}
      <div className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-[var(--green-800,#294a3c)]"
           style={{ left: pctA + "%", right: (100 - pctB) + "%" }} />
      {/* playhead marker */}
      <div className="absolute top-0 bottom-0 w-px bg-[#b27a13]"
           style={{ left: pctP + "%" }}>
        <div className="absolute -top-0.5 -translate-x-1/2 w-0 h-0"
             style={{ borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "6px solid #b27a13" }} />
      </div>
      {/* handle A */}
      <Handle pct={pctA} active={drag === "a"} onDown={() => setDrag("a")} />
      {/* handle B */}
      <Handle pct={pctB} active={drag === "b"} onDown={() => setDrag("b")} />
    </div>
  );
};

const Handle = ({ pct, active, onDown }) => (
  <div onMouseDown={onDown} onTouchStart={onDown}
       className={"absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full border-2 cursor-grab " +
         (active ? "border-[var(--ink)] bg-white shadow-md scale-110 cursor-grabbing" : "border-[var(--green-800,#294a3c)] bg-white shadow")}
       style={{ left: pct + "%" }} />
);

const fmtDur = (m) => {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${h}h ${String(min).padStart(2, "0")}m`;
};

window.Histories = Histories;
