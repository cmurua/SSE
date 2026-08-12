// Monta providers globales (auth, query, i18n) y el router. Puerto de
// App.jsx del prototipo: alli el ruteo era un simple useState("route");
// aca se reemplaza por react-router manteniendo los mismos ids de pantalla
// (home, realtime, historicals, reports, help, about, login).
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./app/providers/AuthProvider";
import { QueryProvider } from "./app/providers/QueryProvider";
import { AppRoutes } from "./app/routes";

export function App() {
  return (
    <QueryProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </QueryProvider>
  );
}
