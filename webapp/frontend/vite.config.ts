import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Em desenvolvimento (npm run dev) o Vite roda em :5173 e encaminha /api para o FastAPI em :8000.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": "http://127.0.0.1:8000" },
  },
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 5000 },
});
