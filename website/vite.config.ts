import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // The form rules the `website` Edge Function also runs, so the two can't drift.
      "@rules": path.resolve(__dirname, "../supabase/functions/_shared/website.ts"),
    },
  },
});