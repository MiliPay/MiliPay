import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Tests live in one place at the root rather than beside each app, because
    // most of what is worth testing here is shared: the tier maths that the
    // Edge Functions enforce, and the agreement between the four independent
    // copies of the tier table.
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
