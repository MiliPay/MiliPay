import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  server: { port: 5175, strictPort: true },
  resolve: {
    alias: {
      "@milipay/shared": path.resolve(__dirname, "../packages/shared/src"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
});