import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const support = (file: string) =>
  fileURLToPath(new URL(`./tests/support/edge/${file}`, import.meta.url));

export default defineConfig({
  resolve: {
    // The Edge Functions import by URL, which Deno fetches and Node cannot.
    // These map each URL onto something Node can load, so an Edge Function can
    // be imported and its handler called with real Requests. Only the
    // transport and the database are stood in for; the function's own code,
    // and every _shared module it uses, run unmodified.
    alias: [
      {
        find: /^https:\/\/deno\.land\/std@[\d.]+\/http\/server\.ts$/,
        replacement: support("std-http-server.ts"),
      },
      {
        find: /^https:\/\/esm\.sh\/@supabase\/supabase-js@[\d.]+$/,
        replacement: support("supabase-js.ts"),
      },
      // The real library. The Deno functions pin 3.x; the workspace has 4.x,
      // whose z.object / enum / regex / safeParse behave the same for the
      // schemas in use.
      { find: /^https:\/\/esm\.sh\/zod@[\d.]+$/, replacement: "zod" },
    ],
  },
  test: {
    // Tests live in one place at the root rather than beside each app, because
    // most of what is worth testing here is shared: the tier maths that the
    // Edge Functions enforce, and the agreement between the four independent
    // copies of the tier table.
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
