const Login = ({ onLogin }) => {
  const L = window.LABELS.login;
  const [user, setUser] = React.useState("");
  const [pass, setPass] = React.useState("");
  const [lang, setLang] = React.useState("es");
  const [err, setErr] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const submit = (e) => {
    e.preventDefault();
    setErr("");
    if (!user.trim() || !pass.trim()) {
      setErr(window.LABELS.login.error);
      return;
    }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      onLogin({ name: window.USER.name, email: user.includes("@") ? user : window.USER.email });
    }, 550);
  };

  return (
    <div className="min-h-screen w-full flex flex-col bg-green-deep text-white relative overflow-hidden">
      {/* subtle blueprint background */}
      <div aria-hidden className="absolute inset-0 opacity-[0.06] pointer-events-none"
        style={{
          backgroundImage: `
            radial-gradient(circle at 20% 30%, #fff 0 1px, transparent 2px),
            radial-gradient(circle at 80% 70%, #fff 0 1px, transparent 2px),
            repeating-linear-gradient(0deg, transparent 0 39px, rgba(255,255,255,.4) 39px 40px),
            repeating-linear-gradient(90deg, transparent 0 39px, rgba(255,255,255,.4) 39px 40px)
          `
        }} />

      {/* Flag selector — upper right */}
      <div className="absolute top-5 right-6 z-10 flex items-center gap-3">
        <span className="text-[11px] uppercase tracking-widest text-white/55 font-mono mr-1">Idioma</span>
        <FlagButton code="es" label="Español" active={lang === "es"} onClick={() => setLang("es")} />
        <FlagButton code="en" label="English" active={lang === "en"} onClick={() => setLang("en")} />
        <FlagButton code="pt" label="Português" active={lang === "pt"} onClick={() => setLang("pt")} />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative">
        {/* wordmark */}
        <div className="flex items-end gap-5 mb-10">
          <div className="text-white leading-none font-bold tracking-tight" style={{ fontSize: "64px" }}>SSE</div>
          <div className="border-l border-white/30 pl-5 pb-1">
            <div className="text-[11px] tracking-[0.18em] text-white/60 font-medium uppercase">Sistema de</div>
            <div className="text-[11px] tracking-[0.18em] text-white/60 font-medium uppercase">Soporte a la</div>
            <div className="text-[11px] tracking-[0.18em] text-white/60 font-medium uppercase">Enseñanza</div>
          </div>
        </div>

        {/* card */}
        <form onSubmit={submit} className="w-full max-w-[420px] bg-white text-[var(--ink)] rounded-xl shadow-lg p-7">
          <div className="mb-1 text-[15px] font-semibold">{L.title}</div>
          <div className="mb-5 text-xs text-muted">{L.subtitle}</div>

          <label className="label-text">{L.user}</label>
          <input className="field mb-4" placeholder={L.userPh} value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" />

          <label className="label-text">{L.pass}</label>
          <input type="password" className="field mb-4" placeholder={L.passPh} value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" />

          {err && (
            <div className="mt-2 flex items-start gap-2 px-3 py-2 rounded-lg bg-[#fdecea] border border-[#f3c1bd] text-[#8a201a] text-xs">
              <window.IAlert size={14} className="mt-0.5 shrink-0" />
              <span>{err}</span>
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-dark w-full mt-5 !py-3 !rounded-lg !text-sm">
            {loading ? "Verificando…" : L.submit}
          </button>

          <div className="mt-3 text-[11px] text-muted text-center">{L.hint}</div>
        </form>

        {/* footer institutional crests */}
        <div className="mt-12 flex items-center gap-7 text-white/85">
          <Crest label="UNC" subtitle="Universidad Nacional de Córdoba" />
          <span className="w-px h-10 bg-white/15" />
          <Crest label="FCEFyN" subtitle="Facultad de Ciencias Exactas, Físicas y Naturales" mono />
          <span className="w-px h-10 bg-white/15" />
          <Crest label="RA-0" subtitle="Reactor Nuclear de Investigación" mono />
        </div>
        <div className="mt-6 text-[11px] text-white/40">{window.LABELS.login.secure}</div>
      </div>
    </div>
  );
};

const FlagButton = ({ code, label, active, onClick }) => (
  <button onClick={onClick} title={label}
    className={"group relative w-10 h-7 rounded-[3px] overflow-hidden ring-offset-2 ring-offset-[var(--green-900,#1f3a30)] transition-all " +
      (active ? "ring-2 ring-white scale-105" : "ring-1 ring-white/30 hover:ring-white/70 opacity-80 hover:opacity-100")}>
    <Flag code={code} />
    <span className="sr-only">{label}</span>
  </button>
);

const Flag = ({ code }) => {
  if (code === "es") {
    // Argentine flag
    return (
      <svg viewBox="0 0 40 28" width="100%" height="100%" preserveAspectRatio="none">
        <rect width="40" height="28" fill="#74ACDF" />
        <rect y="9.33" width="40" height="9.33" fill="#FFFFFF" />
        <g transform="translate(20 14)">
          <circle r="2.6" fill="#F6B40E" stroke="#85340A" strokeWidth="0.25" />
          <g fill="#F6B40E" stroke="#85340A" strokeWidth="0.25">
            {Array.from({ length: 16 }).map((_, i) => {
              const a = (i * Math.PI) / 8;
              const x = Math.cos(a) * 4;
              const y = Math.sin(a) * 4;
              return <circle key={i} cx={x} cy={y} r="0.65" />;
            })}
          </g>
        </g>
      </svg>
    );
  }
  if (code === "en") {
    // United States flag
    return (
      <svg viewBox="0 0 70 37" width="100%" height="100%" preserveAspectRatio="none">
        {/* 13 stripes */}
        {Array.from({ length: 13 }).map((_, i) => (
          <rect key={i} y={i * (37 / 13)} width="70" height={37 / 13} fill={i % 2 === 0 ? "#B22234" : "#FFFFFF"} />
        ))}
        {/* canton */}
        <rect width="28" height={37 * 7 / 13} fill="#3C3B6E" />
        {/* simplified star field — 5x4 grid of stars */}
        {Array.from({ length: 5 }).map((_, r) => (
          Array.from({ length: 6 }).map((__, c) => (
            <circle key={`${r}-${c}`} cx={2.5 + c * 4.5} cy={2.5 + r * 4} r="0.9" fill="#fff" />
          ))
        ))}
      </svg>
    );
  }
  if (code === "pt") {
    // Brazilian flag
    return (
      <svg viewBox="0 0 70 49" width="100%" height="100%" preserveAspectRatio="none">
        <rect width="70" height="49" fill="#009C3B" />
        <polygon points="35,5 65,24.5 35,44 5,24.5" fill="#FFDF00" />
        <circle cx="35" cy="24.5" r="9" fill="#002776" />
        <path d="M26,21 Q35,28 44,21" fill="none" stroke="#fff" strokeWidth="1.4" />
      </svg>
    );
  }
  return null;
};

const Crest = ({ label, subtitle, mono }) => (
  <div className="flex items-center gap-3">
    <div className="w-9 h-9 rounded-full border border-white/40 flex items-center justify-center">
      <window.IHexagon size={18} />
    </div>
    <div>
      <div className={"text-sm font-semibold leading-tight " + (mono ? "font-mono" : "")}>{label}</div>
      <div className="text-[10px] text-white/55 leading-tight max-w-[120px]">{subtitle}</div>
    </div>
  </div>
);

window.Login = Login;
