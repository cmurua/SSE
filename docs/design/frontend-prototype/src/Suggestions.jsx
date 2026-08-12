const Suggestions = () => {
  const L = window.LABELS.suggestions;
  const [type, setType] = React.useState("error");
  const [name, setName] = React.useState(window.USER.name);
  const [email, setEmail] = React.useState(window.USER.email);
  const [subject, setSubject] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [severity, setSeverity] = React.useState("media");
  const [sent, setSent] = React.useState(false);
  const [errors, setErrors] = React.useState({});

  const submit = (e) => {
    e.preventDefault();
    const errs = {};
    if (!name.trim()) errs.name = "Requerido";
    if (!email.trim() || !email.includes("@")) errs.email = "Email inválido";
    if (!subject.trim()) errs.subject = "Requerido";
    if (!message.trim() || message.length < 10) errs.message = "Mínimo 10 caracteres";
    setErrors(errs);
    if (Object.keys(errs).length === 0) setSent(true);
  };

  if (sent) {
    return (
      <div className="space-y-5">
        <div className="banner">{L.title}</div>
        <div className="card card-pad py-14 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full bg-[#e6f2ec] flex items-center justify-center text-[#2e7d4f] mb-4">
            <window.ICheck size={26} strokeWidth={2.5} />
          </div>
          <div className="font-mono text-[11px] uppercase tracking-widest text-muted mb-2">TICKET #SSE-{Math.floor(Math.random() * 9000 + 1000)}</div>
          <h2 className="text-[20px] font-semibold mb-2">{L.success}</h2>
          <p className="text-[13px] text-muted max-w-md mb-6">{L.successLead}</p>
          <button onClick={() => { setSent(false); setSubject(""); setMessage(""); }} className="btn-dark">{L.another}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="banner">{L.title}</div>

      <div className="grid grid-cols-12 gap-5">
        <aside className="col-span-12 lg:col-span-4 card card-pad self-start">
          <div className="text-[11px] uppercase tracking-widest text-muted font-mono mb-2">¿Qué se puede reportar?</div>
          <ul className="text-[13px] space-y-2 text-[#3a3d42]">
            <li className="flex gap-2"><window.IAlert size={14} className="mt-0.5 text-[#b3261e]" /><span>Errores en gráficos, valores incoherentes o caídas del sistema.</span></li>
            <li className="flex gap-2"><window.IInfo size={14} className="mt-0.5 text-[#2f6fb5]" /><span>Sugerencias sobre nuevas variables, layouts o exportaciones.</span></li>
            <li className="flex gap-2"><window.IClipboard size={14} className="mt-0.5 text-[#b27a13]" /><span>Mejoras en el material didáctico y la guía de ayuda.</span></li>
          </ul>
          <div className="mt-5 pt-4 border-t border-line text-[12px] text-muted">
            Los reportes son recibidos por el equipo del SSE. No utilice este formulario para incidentes operativos del reactor.
          </div>
        </aside>

        <form onSubmit={submit} className="col-span-12 lg:col-span-8 card card-pad space-y-4" noValidate>
          {/* Type radio */}
          <div>
            <label className="label-text">{L.type}</label>
            <div className="grid grid-cols-2 gap-2">
              <TypeChoice active={type === "error"} onClick={() => setType("error")}
                          icon={<window.IAlert size={14} />} label={L.typeError} color="#b3261e" />
              <TypeChoice active={type === "suggestion"} onClick={() => setType("suggestion")}
                          icon={<window.IInfo size={14} />} label={L.typeSuggestion} color="#2f6fb5" />
            </div>
          </div>

          {/* Name + email */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label-text">{L.name}</label>
              <input className="field" placeholder={L.namePh} value={name} onChange={(e) => setName(e.target.value)} />
              {errors.name && <div className="text-[11px] text-[#b3261e] mt-1">{errors.name}</div>}
            </div>
            <div>
              <label className="label-text">{L.email}</label>
              <input className="field" placeholder={L.emailPh} value={email} onChange={(e) => setEmail(e.target.value)} />
              {errors.email && <div className="text-[11px] text-[#b3261e] mt-1">{errors.email}</div>}
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className="label-text">{L.subject}</label>
            <input className="field" placeholder={L.subjectPh} value={subject} onChange={(e) => setSubject(e.target.value)} />
            {errors.subject && <div className="text-[11px] text-[#b3261e] mt-1">{errors.subject}</div>}
          </div>

          {/* Severity (only for error) */}
          {type === "error" && (
            <div>
              <label className="label-text">{L.severity}</label>
              <div className="flex items-center gap-2">
                {[
                  { id: "baja", label: L.severityLow, color: "#6c7176" },
                  { id: "media", label: L.severityMed, color: "#b27a13" },
                  { id: "alta", label: L.severityHigh, color: "#b3261e" },
                ].map(s => (
                  <button key={s.id} type="button" onClick={() => setSeverity(s.id)}
                          className={"px-3 py-1.5 rounded-full text-[12px] border transition-colors " + (severity === s.id ? "bg-[var(--ink)] text-white border-[var(--ink)]" : "border-line-2 hover:border-[var(--ink)]")}>
                    <span className="w-1.5 h-1.5 rounded-full inline-block mr-1.5 align-middle" style={{ background: s.color }} />
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message */}
          <div>
            <label className="label-text">{L.message}</label>
            <textarea className="field min-h-[140px] resize-y" placeholder={L.messagePh} value={message} onChange={(e) => setMessage(e.target.value)} />
            <div className="flex justify-between mt-1">
              {errors.message ? <div className="text-[11px] text-[#b3261e]">{errors.message}</div> : <div />}
              <div className="text-[11px] text-muted font-mono">{message.length} / 1000</div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="text-[11px] text-muted">Recibirá una copia del reporte en <span className="font-mono">{email || "—"}</span>.</div>
            <button type="submit" className="btn-dark">{L.submit}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

const TypeChoice = ({ active, onClick, icon, label, color }) => (
  <button type="button" onClick={onClick}
          className={"flex items-center gap-2 px-4 py-3 rounded-lg border text-[13px] font-medium transition-all " + (active ? "border-[var(--ink)] bg-[#fafbfc]" : "border-line-2 hover:border-line")}>
    <span className="w-6 h-6 rounded-md flex items-center justify-center text-white" style={{ background: color }}>{icon}</span>
    {label}
    <span className="ml-auto">
      <span className={"w-3.5 h-3.5 rounded-full border inline-block " + (active ? "bg-[var(--ink)] border-[var(--ink)]" : "border-line-2")} />
    </span>
  </button>
);

window.Suggestions = Suggestions;
