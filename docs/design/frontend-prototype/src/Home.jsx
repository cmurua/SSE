const Home = ({ onNav, sermo }) => {
  const L = window.LABELS.home;
  const cards = [
    { id: "realtime",    icon: window.IActivity,  ...L.cards.realtime,    color: "#2f6fb5" },
    { id: "histories",   icon: window.IHistory,   ...L.cards.histories,   color: "#335a48" },
    { id: "help",        icon: window.IHelp,      ...L.cards.help,        color: "#6c7176" },
    { id: "suggestions", icon: window.IClipboard, ...L.cards.suggestions, color: "#b27a13" },
    { id: "about",       icon: window.IAtom,      ...L.cards.about,       color: "#2a2d31" },
  ];

  return (
    <div className="space-y-5">
      {/* Hero — compact, with control-room photo */}
      <div className="grid grid-cols-12 gap-5 items-stretch">
        <div className="col-span-12 md:col-span-7 card card-pad flex flex-col justify-center">
          <div className="font-mono text-[11px] tracking-widest uppercase text-muted mb-2">RA-0 · UNC · FCEFyN</div>
          <h1 className="text-[26px] font-semibold leading-tight text-[var(--ink)]">{L.heroTitle}</h1>
          <h2 className="text-[18px] font-medium leading-tight text-muted mt-0.5">{L.heroSubtitle}</h2>
          <p className="mt-2.5 text-[13px] text-[#3a3d42] leading-relaxed max-w-xl">{L.heroLead}</p>
          <div className="mt-4">
            <span className="chip">
              <span className={"w-2 h-2 rounded-full " + (sermo ? "bg-[#2e7d4f]" : "bg-[#b3261e]")} />
              <span className="font-mono text-[11px] uppercase tracking-wider">{sermo ? "operación" : "no operativo"}</span>
            </span>
          </div>
        </div>
        <div className="col-span-12 md:col-span-5 relative overflow-hidden rounded-xl border border-line" style={{ minHeight: 180 }}>
          <img src="assets/ra0-control-room.png" alt="Sala de control del reactor RA-0"
               className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent pointer-events-none" />
          <div className="absolute bottom-2 left-3 font-mono text-[10px] text-white/85 tracking-wider">SALA-CONTROL · RA-0</div>
        </div>
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {cards.map(c => (
          <button key={c.id} onClick={() => onNav(c.id)}
                  className="card card-pad text-left flex flex-col gap-3 hover:shadow-md hover:border-line-2 transition-all group min-h-[160px]">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white"
                 style={{ background: c.color }}>
              <c.icon size={20} />
            </div>
            <div>
              <div className="font-semibold text-[14px] mb-1 group-hover:text-green-header">{c.t}</div>
              <div className="text-[12px] text-muted leading-snug">{c.d}</div>
            </div>
            <div className="mt-auto flex items-center gap-1 text-[11px] text-muted group-hover:text-[var(--ink)]">
              <span>Abrir</span>
              <window.IChevronR size={12} />
            </div>
          </button>
        ))}
      </div>

      {/* Quick info row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <InfoTile title="Variables monitoreadas" value={window.VARIABLES.length} hint="parámetros físicos del reactor" />
        <InfoTile title="Operaciones registradas" value={window.OPERATIONS.length} hint="históricos disponibles" />
        <InfoTile title="Frecuencia de muestreo" value="1 Hz" hint="adquisición continua bajo SERMO" mono />
      </div>
    </div>
  );
};

const InfoTile = ({ title, value, hint, mono }) => (
  <div className="card card-pad">
    <div className="text-[11px] uppercase tracking-wider text-muted font-mono">{title}</div>
    <div className={"mt-2 text-[28px] leading-none font-semibold " + (mono ? "font-mono" : "")}>{value}</div>
    <div className="mt-2 text-[12px] text-muted">{hint}</div>
  </div>
);

window.Home = Home;
