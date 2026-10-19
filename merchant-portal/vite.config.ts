import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  // Shared per-environment settings: env/.env.<development|staging|production>.
  envDir: path.resolve(__dirname, "../env"),
  server: { port: 5176, strictPort: true },
  resolve: {
    alias: {
      "@milipay/shared": path.resolve(__dirname, "../packages/shared/src"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
