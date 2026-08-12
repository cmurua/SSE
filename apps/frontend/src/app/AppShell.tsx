// Layout: header + nav + indicador SERMO + footer. Puerto directo de
// Shell.jsx del prototipo (misma estructura, ahora con react-router
// <Outlet/> en vez de children por prop).
import { Outlet } from "react-router-dom";

export function AppShell() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* TODO: header con nav (ver Shell.jsx original) + SermoIndicator */}
      <main className="flex-1">
        <Outlet />
      </main>
      {/* TODO: footer */}
    </div>
  );
}
