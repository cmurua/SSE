// Tabla de rutas. Nombres alineados 1:1 con las pantallas del prototipo
// (Home, Realtime, Histories->Historicals, Suggestions->Reports, Help, About).
import { Routes, Route } from "react-router-dom";
import { AppShell } from "./AppShell";
import { LoginPage } from "@/features/auth/pages/LoginPage";
import { HomePage } from "@/features/home/pages/HomePage";
import { RealtimePage } from "@/features/realtime/pages/RealtimePage";
import { HistoricalsPage } from "@/features/historicals/pages/HistoricalsPage";
import { OperationDetailPage } from "@/features/historicals/pages/OperationDetailPage";
import { ReportsPage } from "@/features/reports/pages/ReportsPage";
import { HelpPage } from "@/features/help/pages/HelpPage";
import { AboutPage } from "@/features/about/pages/AboutPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/realtime" element={<RealtimePage />} />
        <Route path="/historicals" element={<HistoricalsPage />} />
        <Route path="/historicals/:operationId" element={<OperationDetailPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/about" element={<AboutPage />} />
      </Route>
    </Routes>
  );
}
