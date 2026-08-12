// Paleta y tipografia portadas de SSE.html (prototipo Claude Design) via
// src/styles/tokens.css. TODO: mapear --green-900, --accent, etc. como
// colores de Tailwind si se decide no depender de CSS vars directamente.
import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
