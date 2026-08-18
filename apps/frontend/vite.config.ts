import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  // host: true expone el dev server fuera del contenedor (0.0.0.0);
  // strictPort evita que Vite se mueva a otro puerto y rompa el mapeo Docker.
  server: { host: true, port: 5173, strictPort: true },
});
