// AppShell: header + nav + status indicator + user menu.
const Shell = ({ user, route, onNav, sermo, setSermo, onLogout, children }) => {
  const L = window.LABELS;
  const navItems = [
    { id: "realtime", label: L.nav.realtime },
    { id: "histories", label: L.nav.histories },
    { id: "suggestions", label: L.nav.suggestions },
    { id: "help", label: L.nav.help },
    { id: "about", label: L.nav.about },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-green-header text-white">
        <div className="max-w-[1400px] mx-auto px-6 h-[64px] flex items-center justify-between gap-6">
          <div className="flex items-center gap-8">
            <button onClick={() => onNav("home")} className="text-white text-[26px] leading-none font-bold tracking-tight">
              SSE
            </button>
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map(n => (
                <button key={n.id} onClick={() => onNav(n.id)}
                        className={"navlink " + (route === n.id ? "active" : "")}>
                  {n.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-5">
            <SermoIndicator sermo={sermo} onToggle={() => setSermo(!sermo)} />
            <div className="hidden md:flex items-center gap-2 text-[13px]">
              <span className="text-white/85">{L.nav.welcome}, {user.name}</span>
            </div>
            <button onClick={() => onNav("help")} className="text-white/70 hover:text-white" title={L.nav.help}>
              <window.IHelp size={18} />
            </button>
            <button onClick={onLogout} className="flex items-center gap-1.5 text-[13px] text-white/85 hover:text-white">
              <window.ILogOut size={14} />
              <span>{L.nav.logout}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Page */}
      <main className="flex-1">
        <div className="max-w-[1400px] mx-auto px-6 py-6">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-line bg-white">
        <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between text-[11px] text-muted">
          <div>SSE-330 v1.0.0 · {L.institution} · {L.faculty}</div>
          <div className="font-mono">RA-0 · Sistema de solo lectura</div>
        </div>
      </footer>
    </div>
  );
};

const SermoIndicator = ({ sermo, onToggle }) => {
  return (
    <button onClick={onToggle} title="Toggle SERMO (demo)"
      className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full border border-white/20 hover:border-white/40 transition-colors">
      <span className="relative flex items-center justify-center w-5 h-5">
        <span className={"absolute inset-0 rounded-full pulse-dot " + (sermo ? "bg-[#3ecf8e]/35" : "bg-white/15")} />
        <span className={"relative w-2.5 h-2.5 rounded-full " + (sermo ? "bg-[#3ecf8e]" : "bg-white/40")} />
      </span>
      <span className="text-[11px] font-mono uppercase tracking-wider text-white/85">
        SERMO · {sermo ? "ON" : "OFF"}
      </span>
      <span className={"text-[11px] font-semibold " + (sermo ? "text-[#9bf0c4]" : "text-white/55")}>
        {sermo ? window.LABELS.status.operating : window.LABELS.status.stopped}
      </span>
    </button>
  );
};

window.Shell = Shell;
