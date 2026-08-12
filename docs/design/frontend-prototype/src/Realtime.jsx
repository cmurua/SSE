// Real-time dashboard.
const Realtime = ({ sermo, onNav }) => {
  const L = window.LABELS;
  const [selected, setSelected] = React.useState(["POT_NUC", "TEM_NUC"]);
  const [mode, setMode] = React.useState("time"); // "time" | "xy"
  const [filter, setFilter] = React.useState("");
  const [tick, setTick] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const [seriesData, setSeriesData] = React.useState({});

  // Init series
  React.useEffect(() => {
    if (!sermo) return;
    const next = {};
    window.VARIABLES.forEach(v => {
      next[v.id] = window.generateSeries(v, 90, 0);
    });
    setSeriesData(next);
    setTick(90);
  }, [sermo]);

  // Tick every 1s
  React.useEffect(() => {
    if (!sermo || paused) return;
    const id = setInterval(() => {
      setSeriesData(prev => {
        const next = { ...prev };
        window.VARIABLES.forEach(v => {
          const arr = next[v.id] ? [...next[v.id]] : [];
          const newPoints = window.generateSeries(v, 1, tick + 1);
          arr.push(newPoints[0]);
          if (arr.length > 90) arr.shift();
          next[v.id] = arr;
        });
        return next;
      });
      setTick(t => t + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [sermo, paused, tick]);

  const toggleVar = (id) => {
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  const selectedDefs = selected.map(id => window.VARIABLES.find(v => v.id === id)).filter(Boolean);
  const selectedData = {};
  selected.forEach(id => { selectedData[id] = seriesData[id] || []; });

  // Snapshot for ControlBarsPanel — latest value per variable
  const instantSnapshot = React.useMemo(() => {
    const out = {};
    ["POS_BR1", "POS_BR2", "POS_BR3", "POS_BR4", "POS_BRS", "NIV_MOD"].forEach(id => {
      const arr = seriesData[id];
      if (arr && arr.length) out[id] = arr[arr.length - 1].v;
    });
    return out;
  }, [seriesData]);

  const filteredVars = window.VARIABLES.filter(v =>
    !filter || v.name.toLowerCase().includes(filter.toLowerCase()) || v.id.toLowerCase().includes(filter.toLowerCase()) || v.group.toLowerCase().includes(filter.toLowerCase())
  );

  const groups = [...new Set(filteredVars.map(v => v.group))];

  const lastUpdate = new Date(Date.now()).toLocaleTimeString("es-AR");

  // OFF state
  if (!sermo) {
    return (
      <div className="space-y-5">
        <div className="banner">{L.realtime.title}</div>
        <div className="card card-pad flex flex-col items-center text-center py-16">
          <div className="w-16 h-16 rounded-full bg-[#f3e6e5] flex items-center justify-center text-[#b3261e] mb-4">
            <window.IAlert size={28} />
          </div>
          <div className="font-mono text-[11px] uppercase tracking-widest text-muted mb-2">SERMO · OFF</div>
          <h2 className="text-[22px] font-semibold mb-2">{L.realtime.notAvailable}</h2>
          <p className="text-[14px] text-muted max-w-md mb-6">{L.realtime.notAvailableLead}</p>
          <button onClick={() => onNav("histories")} className="btn-dark">{L.realtime.goHistories}</button>
          <div className="mt-8 grid grid-cols-3 gap-6 text-left max-w-2xl w-full">
            <KV k="Estado actual" v={L.status.stopped} accent="#b3261e" />
            <KV k="SERMO" v="false" mono />
            <KV k="Adquisición" v="pausada" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="banner">{L.realtime.title}</div>

      {/* Status strip */}
      <div className="card grid grid-cols-2 md:grid-cols-5 divide-x divide-line overflow-hidden">
        <StatTile label="Estado" value={L.status.operating} accent="#2e7d4f" pulse />
        <StatTile label={L.realtime.operationId} value="OP-2026-042" mono />
        <StatTile label={L.realtime.sessionStart} value="14:08:22" mono />
        <StatTile label={L.realtime.duration} value={fmtDuration(tick)} mono />
        <StatTile label={L.realtime.sampleRate} value={L.realtime.sampleRateValue} mono />
      </div>

      {/* Control bars + moderator level */}
      <window.ControlBarsPanel snapshot={instantSnapshot} />

      {/* Main split */}
      <div className="grid grid-cols-12 gap-5">
        {/* Sidebar: variables */}
        <aside className="col-span-12 lg:col-span-4 xl:col-span-3 card flex flex-col self-start">
          <div className="px-4 py-3 border-b border-line">
            <div className="font-semibold text-[14px]">{L.realtime.chooseVariables}</div>
            <div className="text-[11px] text-muted mt-0.5">{L.realtime.chooseVarsHint}</div>
          </div>

          {/* selected chips */}
          <div className="px-4 py-3 border-b border-line">
            <div className="text-[11px] uppercase tracking-wider text-muted font-mono mb-2">
              {L.variables.selected} · {selected.length}/2
            </div>
            <div className="flex flex-wrap gap-1.5">
              {selectedDefs.length === 0 && (
                <div className="text-[12px] text-muted italic">Ninguna seleccionada</div>
              )}
              {selectedDefs.map((v, i) => (
                <span key={v.id} className="chip" style={{ borderColor: ["#2f6fb5", "#b27a13"][i] }}>
                  <span className="w-2 h-2 rounded-full" style={{ background: ["#2f6fb5", "#b27a13"][i] }} />
                  <span className="text-[11px]">{v.name}</span>
                  <button onClick={() => toggleVar(v.id)} className="ml-1 text-muted hover:text-[var(--ink)]">
                    <window.IX size={11} />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* search */}
          <div className="px-4 py-3 border-b border-line">
            <div className="relative">
              <window.ISearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              <input className="field !pl-9" placeholder="Buscar variable…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            </div>
          </div>

          {/* list */}
          <div className="overflow-y-auto" style={{ maxHeight: 460 }}>
            {groups.map(g => (
              <div key={g}>
                <div className="px-4 py-2 bg-[#f7f8f9] text-[10px] uppercase tracking-widest text-muted font-mono border-b border-line">{g}</div>
                {filteredVars.filter(v => v.group === g).map(v => {
                  const isSel = selected.includes(v.id);
                  const colorIdx = selected.indexOf(v.id);
                  const color = colorIdx >= 0 ? ["#2f6fb5", "#b27a13"][colorIdx] : null;
                  const last = (seriesData[v.id] || []).slice(-1)[0];
                  return (
                    <button key={v.id} onClick={() => toggleVar(v.id)}
                            className={"w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 border-b border-line hover:bg-[#f7f8f9] " + (isSel ? "bg-[#f7f8f9]" : "")}>
                      <div className="min-w-0 flex items-center gap-2">
                        <span className={"w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 " + (isSel ? "" : "border-line-2")}
                              style={isSel ? { background: color, borderColor: color } : {}}>
                          {isSel && <window.ICheck size={9} className="text-white" strokeWidth={3} />}
                        </span>
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium truncate">{v.name}</div>
                          <div className="text-[10px] text-muted font-mono">{v.id} · {v.unit}</div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[12px] font-mono font-semibold">{last ? fmtVal(last.v) : "—"}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
            {filteredVars.length === 0 && <div className="px-4 py-6 text-center text-muted text-[13px]">Sin resultados</div>}
          </div>
        </aside>

        {/* Chart area */}
        <section className="col-span-12 lg:col-span-8 xl:col-span-9 space-y-4">
          {/* Toolbar */}
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
            <span className="text-[11px] text-muted font-mono">
              {L.realtime.lastUpdate}: <span className="text-[var(--ink)]">{lastUpdate}</span>
            </span>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={() => setPaused(p => !p)} className="btn-ghost flex items-center gap-1.5">
                {paused ? <window.IPlay size={11} /> : <window.IPause size={11} />}
                {paused ? "Reanudar" : "Pausar"}
              </button>
              <button className="btn-dark flex items-center gap-1.5">
                <window.IDownload size={12} />
                {L.realtime.export}
              </button>
            </div>
          </div>

          {/* Chart */}
          <ChartPlaceholder
            variables={selectedDefs}
            data={selectedData}
            mode={mode}
            title={mode === "time" ? "Variable vs Tiempo" : "Variable B vs Variable A"}
            height={360}
          />

          {/* Instant readouts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {selectedDefs.length === 0 && (
              <div className="card card-pad md:col-span-2 text-center text-muted text-[13px]">
                Seleccione variables del panel lateral para iniciar la visualización.
              </div>
            )}
            {selectedDefs.map((v, i) => {
              const arr = seriesData[v.id] || [];
              const last = arr.slice(-1)[0];
              const min = arr.length ? Math.min(...arr.map(p => p.v)) : 0;
              const max = arr.length ? Math.max(...arr.map(p => p.v)) : 0;
              const avg = arr.length ? arr.reduce((s, p) => s + p.v, 0) / arr.length : 0;
              const color = ["#2f6fb5", "#b27a13"][i];
              return (
                <div key={v.id} className="card card-pad">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold truncate">{v.name}</div>
                        <div className="text-[10px] text-muted font-mono">{v.id} · {v.unit}</div>
                      </div>
                    </div>
                    <div className="font-mono text-[10px] text-muted">[{v.min}, {v.max}] {v.unit}</div>
                  </div>
                  <div className="flex items-end gap-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted font-mono">{L.realtime.instant}</div>
                      <div className="text-[28px] font-mono font-semibold leading-none mt-1" style={{ color }}>
                        {last ? fmtVal(last.v) : "—"}
                      </div>
                    </div>
                    <div className="ml-auto grid grid-cols-3 gap-3 text-right">
                      <Stat sm label="MÍN" val={fmtVal(min)} />
                      <Stat sm label="PROM" val={fmtVal(avg)} />
                      <Stat sm label="MÁX" val={fmtVal(max)} />
                    </div>
                  </div>
                  {/* sparkline */}
                  <Sparkline data={arr} color={color} />
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
};

const Sparkline = ({ data, color }) => {
  if (!data || !data.length) return null;
  const w = 600, h = 38;
  const ys = data.map(p => p.v);
  const lo = Math.min(...ys), hi = Math.max(...ys);
  const span = hi - lo || 1;
  const d = ys.map((y, i) => {
    const x = (i / (ys.length - 1)) * w;
    const py = h - ((y - lo) / span) * h;
    return (i === 0 ? "M" : "L") + " " + x.toFixed(1) + " " + py.toFixed(1);
  }).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full mt-3" preserveAspectRatio="none" style={{ height: 38 }}>
      <path d={d} fill="none" stroke={color} strokeWidth="1.4" />
    </svg>
  );
};

const Stat = ({ label, val, sm }) => (
  <div>
    <div className={"font-mono text-muted " + (sm ? "text-[9px]" : "text-[10px]") + " uppercase tracking-wider"}>{label}</div>
    <div className={"font-mono font-semibold " + (sm ? "text-[12px]" : "text-[14px]")}>{val}</div>
  </div>
);

const StatTile = ({ label, value, mono, accent, pulse }) => (
  <div className="px-5 py-3.5">
    <div className="text-[10px] uppercase tracking-widest text-muted font-mono">{label}</div>
    <div className="mt-1.5 flex items-center gap-2">
      {pulse && <span className="relative flex w-2 h-2"><span className="absolute inset-0 bg-[#2e7d4f] rounded-full pulse-dot opacity-60" /><span className="relative w-2 h-2 bg-[#2e7d4f] rounded-full" /></span>}
      <span className={"text-[15px] font-semibold " + (mono ? "font-mono" : "")} style={accent ? { color: accent } : {}}>{value}</span>
    </div>
  </div>
);

const KV = ({ k, v, accent, mono }) => (
  <div>
    <div className="text-[10px] uppercase tracking-widest text-muted font-mono">{k}</div>
    <div className={"mt-1 text-[15px] font-semibold " + (mono ? "font-mono" : "")} style={accent ? { color: accent } : {}}>{v}</div>
  </div>
);

const fmtVal = (n) => {
  if (n === undefined || isNaN(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e6) return n.toExponential(2);
  if (a >= 1000) return n.toLocaleString("es-AR", { maximumFractionDigits: 1 });
  if (a < 0.01 && a > 0) return n.toExponential(2);
  return n.toFixed(2);
};

const fmtDuration = (s) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map(n => String(n).padStart(2, "0")).join(":");
};

window.Realtime = Realtime;
window.fmtVal = fmtVal;
