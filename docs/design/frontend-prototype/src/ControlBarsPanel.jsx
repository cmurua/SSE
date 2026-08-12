// ControlBarsPanel — visual gauge for 4 control bars + safety bar + moderator level.
// Reads instantaneous values from the seriesData prop (last point) or accepts a snapshot map.
// Bars are shown as vertical channels with shaded insertion (insertion % from top).
const ControlBarsPanel = ({ snapshot = {}, compact = false }) => {
  const bars = [
    { id: "POS_BR1", label: "BC-1", role: "Control" },
    { id: "POS_BR2", label: "BC-2", role: "Control" },
    { id: "POS_BR3", label: "BC-3", role: "Control" },
    { id: "POS_BR4", label: "BC-4", role: "Control" },
  ];

  const modV = snapshot["NIV_MOD"];
  const modPct = modV !== undefined ? clamp(modV, 0, 100) : null;

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-line">
        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-[13px]">Núcleo del reactor</span>
          <span className="text-[10px] uppercase tracking-widest text-muted font-mono">barras · moderador</span>
        </div>
        <span className="text-[10px] text-muted font-mono">% inserción</span>
      </div>

      <div className="p-4 grid grid-cols-12 gap-4">
        {/* Bars row */}
        <div className="col-span-12 md:col-span-8">
          <div className="grid grid-cols-4 gap-3 h-full">
            {bars.map(b => {
              const v = snapshot[b.id];
              const pct = v !== undefined ? clamp(v, 0, 100) : null;
              const stateColor = pct == null ? "#6c7176"
                : pct > 80 ? "#b3261e"
                : pct > 50 ? "#b27a13"
                : pct > 0  ? "#2f6fb5"
                : "#6c7176";

              return (
                <div key={b.id} className="flex flex-col items-center">
                  <div className="text-[11px] font-mono font-semibold mb-1.5" style={{ color: stateColor }}>
                    {pct === null ? "—" : pct.toFixed(1) + "%"}
                  </div>
                  <ControlBarGauge pct={pct} color={stateColor} compact={compact} />
                  <div className="mt-1.5 text-[11px] font-semibold">{b.label}</div>
                  <div className="text-[9px] uppercase tracking-wider text-muted font-mono">{b.role}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Moderator level */}
        <div className="col-span-12 md:col-span-4">
          <ModeratorGauge pct={modPct} compact={compact} />
        </div>
      </div>
    </div>
  );
};

const ControlBarGauge = ({ pct, color, compact }) => {
  const H = compact ? 90 : 130;
  const W = 26;
  const fillH = pct == null ? 0 : (pct / 100) * H;
  return (
    <div className="relative" style={{ width: W, height: H }}>
      {/* channel */}
      <div className="absolute inset-x-0 top-0 bottom-0 rounded-md border border-line-2 overflow-hidden"
           style={{ background: "linear-gradient(180deg, #f7f8f9 0%, #ecedef 100%)" }}>
        {/* tick marks */}
        {[0, 25, 50, 75, 100].map(t => (
          <div key={t} className="absolute left-0 right-0 border-t border-line-2/60"
               style={{ top: ((100 - t) / 100) * H, height: 0 }} />
        ))}
        {/* inserted portion (top-down) */}
        <div className="absolute inset-x-0 top-0 transition-[height] duration-300"
             style={{ height: fillH, background: color, opacity: 0.85 }}>
          {/* hatched texture */}
          <div className="absolute inset-0"
               style={{
                 backgroundImage: "repeating-linear-gradient(0deg, rgba(0,0,0,0.18) 0 2px, transparent 2px 8px)",
                 opacity: 0.55,
               }} />
        </div>
        {/* core line at bottom */}
        <div className="absolute inset-x-0 bottom-0 h-1.5 bg-[var(--ink-2)]/85 border-t border-black/30" />
      </div>
    </div>
  );
};

const ModeratorGauge = ({ pct, compact }) => {
  const H = compact ? 110 : 140;
  const fillH = pct == null ? 0 : (pct / 100) * H;
  const status = pct == null ? "—" : pct >= 95 ? "Nominal" : pct >= 80 ? "Bajo" : "Crítico";
  const statusColor = pct == null ? "#6c7176" : pct >= 95 ? "#2e7d4f" : pct >= 80 ? "#b27a13" : "#b3261e";

  return (
    <div className="h-full flex flex-col">
      <div className="text-[11px] uppercase tracking-widest text-muted font-mono mb-2">Nivel de moderador</div>
      <div className="flex items-center gap-4 flex-1">
        {/* tank */}
        <div className="relative" style={{ width: 56, height: H }}>
          <div className="absolute inset-0 rounded-md border border-line-2 overflow-hidden bg-[#f7f8f9]">
            {/* water fill (bottom-up) */}
            <div className="absolute inset-x-0 bottom-0 transition-[height] duration-500"
                 style={{ height: fillH, background: "linear-gradient(180deg, rgba(47,111,181,0.85), rgba(47,111,181,0.55))" }}>
              {/* surface ripple */}
              <div className="absolute -top-1 left-0 right-0 h-2"
                   style={{
                     background: "repeating-linear-gradient(90deg, rgba(255,255,255,0.6) 0 3px, transparent 3px 7px)",
                   }} />
            </div>
            {/* gridlines */}
            {[20, 40, 60, 80].map(t => (
              <div key={t} className="absolute left-0 right-0 border-t border-line-2/50"
                   style={{ top: ((100 - t) / 100) * H, height: 0 }} />
            ))}
          </div>
          {/* tick labels */}
          <div className="absolute -right-7 top-0 h-full flex flex-col justify-between font-mono text-[9px] text-muted">
            <span>100</span><span>50</span><span>0</span>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-[28px] font-mono font-semibold leading-none" style={{ color: statusColor }}>
            {pct == null ? "—" : pct.toFixed(1)}
            <span className="text-[14px] text-muted ml-1">%</span>
          </div>
          <div className="mt-1 text-[11px] font-medium" style={{ color: statusColor }}>{status}</div>
          <div className="mt-2 text-[10px] text-muted leading-snug">
            Cobertura del moderador líquido sobre el núcleo.
          </div>
        </div>
      </div>
    </div>
  );
};

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

window.ControlBarsPanel = ControlBarsPanel;
