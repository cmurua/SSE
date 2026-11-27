// Sin DOM en los tests: document y URL son falsos. Se prueba que el archivo
// se guarde con su nombre y que la URL temporal se libere despues.
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadBlob } from "./download";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("downloadBlob", () => {
  it("descarga con un <a download> temporal y libera la URL despues", () => {
    vi.useFakeTimers();
    const link = { href: "", download: "", style: { display: "" }, click: vi.fn(), remove: vi.fn() };
    const appendChild = vi.fn();
    const createObjectURL = vi.fn().mockReturnValue("blob:fake");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("document", { createElement: () => link, body: { appendChild } });
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    const blob = new Blob(["x"], { type: "text/csv" });

    downloadBlob(blob, "SSE_OP-1_POTM4.csv");

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(link.href).toBe("blob:fake");
    expect(link.download).toBe("SSE_OP-1_POTM4.csv");
    expect(appendChild).toHaveBeenCalledWith(link);
    expect(link.click).toHaveBeenCalledOnce();
    expect(link.remove).toHaveBeenCalledOnce();
    // El navegador lee la URL despues del click: no se libera en el acto.
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake");
  });
});
