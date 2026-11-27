import { describe, expect, it, vi } from "vitest";
import { ChartImageUnavailableError, type ChartHandle } from "@/components/charts/types";
import { exportChartImage, hasPoints, type ExportChartImageInput } from "./exportImage";

const PNG = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" });

function input(chart: ChartHandle | null): ExportChartImageInput {
  return {
    chart,
    image: { title: "Operacion OP-1 · Practica", subtitle: "POTM4 · ventana 0–60 min" },
    fileName: "SSE_OP-1_POTM4_00h00m00s-01h00m00s.png",
    log: {
      source: "historicals",
      operation_id: "OP-1",
      variables: ["POTM4"],
      start: 0,
      end: 3600,
    },
  };
}

describe("exportChartImage", () => {
  it("pide la imagen, la descarga con su nombre y deja constancia", async () => {
    const toImage = vi.fn().mockResolvedValue(PNG);
    const download = vi.fn();
    const logExport = vi.fn().mockResolvedValue(undefined);

    await exportChartImage(input({ toImage }), { download, logExport });

    expect(toImage).toHaveBeenCalledWith({
      title: "Operacion OP-1 · Practica",
      subtitle: "POTM4 · ventana 0–60 min",
    });
    expect(download).toHaveBeenCalledWith(PNG, "SSE_OP-1_POTM4_00h00m00s-01h00m00s.png");
    expect(logExport).toHaveBeenCalledWith({
      format: "png",
      source: "historicals",
      operation_id: "OP-1",
      variables: ["POTM4"],
      start: 0,
      end: 3600,
      file_name: "SSE_OP-1_POTM4_00h00m00s-01h00m00s.png",
    });
  });

  it("si el registro falla, la descarga ya se hizo y no es un error", async () => {
    const download = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(
      exportChartImage(input({ toImage: async () => PNG }), {
        download,
        logExport: () => Promise.reject(new Error("500")),
      }),
    ).resolves.toBeUndefined();
    expect(download).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("sin grafico montado rechaza sin descargar ni registrar", async () => {
    const download = vi.fn();
    const logExport = vi.fn();
    await expect(exportChartImage(input(null), { download, logExport })).rejects.toBeInstanceOf(
      ChartImageUnavailableError,
    );
    expect(download).not.toHaveBeenCalled();
    expect(logExport).not.toHaveBeenCalled();
  });

  it("si el grafico no puede dar la imagen, no registra nada", async () => {
    const download = vi.fn();
    const logExport = vi.fn();
    const chart = { toImage: () => Promise.reject(new ChartImageUnavailableError()) };
    await expect(exportChartImage(input(chart), { download, logExport })).rejects.toBeInstanceOf(
      ChartImageUnavailableError,
    );
    expect(download).not.toHaveBeenCalled();
    expect(logExport).not.toHaveBeenCalled();
  });
});

describe("hasPoints", () => {
  it("alcanza con que una de las variables tenga puntos", () => {
    expect(hasPoints(["LOGA1", "POTM4"], { LOGA1: [], POTM4: [{ t: 0, v: 1 }] })).toBe(true);
  });

  it("sin puntos, o sin variables, no hay nada que exportar", () => {
    expect(hasPoints(["LOGA1"], { LOGA1: [] })).toBe(false);
    expect(hasPoints(["LOGA1"], {})).toBe(false);
    expect(hasPoints([], { LOGA1: [{ t: 0, v: 1 }] })).toBe(false);
  });
});
