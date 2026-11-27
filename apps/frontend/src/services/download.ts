// Guardar un archivo generado en el navegador (PNG) o descargado con
// httpClient.getBlob (CSV). Un <a download> temporal es la unica forma
// estandar de ponerle nombre al archivo.

/** Cuanto se espera antes de liberar la URL del archivo: el navegador la lee
 *  despues del click, no durante. */
const REVOKE_DELAY_MS = 10_000;

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
