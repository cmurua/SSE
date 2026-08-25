// Layout: header verde + nav + footer institucional. Puerto directo de
// Shell.jsx del prototipo (misma estructura y clases), con react-router
// <Outlet/> en vez de children por prop y <NavLink> en vez de onNav().
// El indicador SERMO del prototipo NO se porta aca: va en el issue #2.7.
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthContext } from "./providers/AuthProvider";
import { IHelp, ILogOut } from "@/components/icons";

const NAV_ITEMS = [
  { to: "/realtime", labelKey: "nav.realtime" },
  { to: "/historicals", labelKey: "nav.historicals" },
  { to: "/reports", labelKey: "nav.reports" },
  { to: "/help", labelKey: "nav.help" },
  { to: "/about", labelKey: "nav.about" },
];

const navlinkClass = ({ isActive }: { isActive: boolean }) =>
  "navlink" + (isActive ? " active" : "");

export function AppShell() {
  const { t } = useTranslation("common");
  const { user, logout } = useAuthContext();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-green-header text-white">
        <div className="max-w-[1400px] mx-auto px-6 h-[64px] flex items-center justify-between gap-6">
          <div className="flex items-center gap-8">
            <Link
              to="/"
              className="text-white text-[26px] leading-none font-bold tracking-tight"
            >
              {t("appName")}
            </Link>
            <nav className="hidden md:flex items-center gap-1">
              {NAV_ITEMS.map((item) => (
                <NavLink key={item.to} to={item.to} className={navlinkClass}>
                  {t(item.labelKey)}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-5">
            {user && (
              <div className="hidden md:flex items-center gap-2 text-[13px]">
                <span className="text-white/85">
                  {t("nav.welcome")}, {user.username}
                </span>
              </div>
            )}
            {/* Atajo por icono: es <Link> y no <NavLink> a proposito, para no
                duplicar el aria-current="page" que ya pone el item de nav. */}
            <Link
              to="/help"
              className="text-white/70 hover:text-white"
              title={t("nav.help")}
            >
              <IHelp size={18} />
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-[13px] text-white/85 hover:text-white"
            >
              <ILogOut size={14} />
              <span>{t("nav.logout")}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Page */}
      <main className="flex-1">
        <div className="max-w-[1400px] mx-auto px-6 py-6">
          <Outlet />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-line bg-surface">
        <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between text-[11px] text-muted">
          <div>
            {t("footer.version")} · {t("institution")} · {t("faculty")}
          </div>
          <div className="font-mono">{t("footer.readOnly")}</div>
        </div>
      </footer>
    </div>
  );
}
