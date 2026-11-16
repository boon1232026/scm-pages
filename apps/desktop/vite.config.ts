import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: "localhost",
  },
  envPrefix: ["VITE_", "TAURI_"],
  optimizeDeps: {
    // linked workspace packages ship CJS — prebundle so named exports resolve
    include: ["@scm/sdk", "@scm/contracts"],
  },
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
    commonjsOptions: {
      include: [/node_modules/, /packages\//],
    },
  },
});
