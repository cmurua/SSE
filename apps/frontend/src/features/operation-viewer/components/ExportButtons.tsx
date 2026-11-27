// "Exportar tabla" y "Exportar PNG" (tarea 5.8), como en el prototipo
// (Histories.jsx). Compartido entre Tiempo Real y el historico, asi que no
// sabe de donde salen los archivos: cada pagina le pasa la accion. Sin
// `onExportCsv` (Tiempo Real) el boton de la tabla no aparece.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { IDownload } from "@/components/icons";

export type ExportKind = "png" | "csv";

export interface ExportButtonsProps {
  /** Genera y descarga el PNG del grafico visible. */
  onExportPng: () => Promise<void>;
  /** Descarga el CSV de la ventana. Solo en los historicos. */
  onExportCsv?: () => Promise<void>;
  /** false = en lugar del grafico hay un mensaje: no hay imagen que sacar. */
  pngAvailable: boolean;
}

export function ExportButtons({ onExportPng, onExportCsv, pngAvailable }: ExportButtonsProps) {
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const [failed, setFailed] = useState<ExportKind | null>(null);

  async function run(kind: ExportKind, action: () => Promise<void>) {
    setBusy(kind);
    setFailed(null);
    try {
      await action();
    } catch (error) {
      console.error(`No se pudo exportar (${kind})`, error);
      setFailed(kind);
    } finally {
      setBusy(null);
    }
  }

  return (
    <ExportButtonsView
      busy={busy}
      failed={failed}
      pngAvailable={pngAvailable}
      onPng={() => void run("png", onExportPng)}
      onCsv={onExportCsv && (() => void run("csv", onExportCsv))}
    />
  );
}

export interface ExportButtonsViewProps {
  /** La exportacion en curso: se deshabilitan los dos botones. */
  busy: ExportKind | null;
  /** La ultima que fallo, para avisarlo. */
  failed: ExportKind | null;
  pngAvailable: boolean;
  onPng: () => void;
  onCsv?: () => void;
}

/** Sin estado, para probar cada caso sin DOM. */
export function ExportButtonsView({ busy, failed, pngAvailable, onPng, onCsv }: ExportButtonsViewProps) {
  const { t } = useTranslation("common");
  const working = busy !== null;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center gap-2">
        {onCsv && (
          <button
            type="button"
            data-export="csv"
            className="btn-ghost flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={onCsv}
            disabled={working}
            title={t("viewer.export.csvHint")}
          >
            <IDownload size={11} />
            {busy === "csv" ? t("viewer.export.working") : t("viewer.export.csv")}
          </button>
        )}
        <button
          type="button"
          data-export="png"
          className="btn-dark flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={onPng}
          disabled={working || !pngAvailable}
          title={pngAvailable ? t("viewer.export.pngHint") : t("viewer.export.pngUnavailable")}
        >
          <IDownload size={12} />
          {busy === "png" ? t("viewer.export.working") : t("viewer.export.png")}
        </button>
      </div>
      {failed && (
        <span role="alert" className="text-[12px] text-bad">
          {t(`viewer.export.errors.${failed}`)}
        </span>
      )}
    </div>
  );
}
