import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { TIER_LIMITS } from "../supabase/functions/_shared/tier-math";

/**
 * The tier table exists in four places and none of them can import the others:
 *
 *   1. supabase/functions/_shared/tier-math.ts  — Deno, enforces payments
 *   2. public.tier_limits (seed)                 — SQL; tier_caps() reads it, and
 *                                                 Settings › Tier limits edits it
 *   3. packages/shared/src/types/index.ts        — Vite, the web portals
 *   4. mobile-app/src/lib/limitsView.ts         — Expo, a separate package
 *
 * Deno cannot import from packages/shared, and the Expo app is not in the npm
 * workspace, so a single shared module is not available without restructuring
 * all three build systems. This test is the mitigation: it reads the other
 * three as text and fails the build if any of them drifts from (1).
 *
 * If this test fails, do not edit the test — fix whichever copy is wrong.
 */

const read = (p: string) => fs.readFileSync(p, "utf8");

/** Numbers are written 150_000 in TS and 150000 in SQL; compare as numbers. */
const num = (raw: string) => Number(raw.replace(/_/g, ""));

describe("tier limits agree across every copy", () => {
  it("the tier_limits table starts from tier-math's numbers", () => {
    // Since 20261003130000 the ceilings live in public.tier_limits, edited in
    // Settings › Tier limits, and tier_caps() reads them. The other copies
    // are the defaults it was seeded with (and the app's display until it
    // reads the table), so the seed must match them.
    const sql = read("supabase/migrations/20261003130000_staff_and_settings.sql");
    const seed = sql.slice(sql.indexOf("INSERT INTO public.tier_limits"));
    for (const tier of [1, 2, 3] as const) {
      const row = seed.match(new RegExp(`\\(${tier}, (\\d+), (\\d+), (\\d+)\\)`));
      expect(row, `no seed row for tier ${tier}`).not.toBeNull();
      expect(num(row![1]), `tier ${tier} single limit`).toBe(TIER_LIMITS[tier].maxSingle);
      expect(num(row![2]), `tier ${tier} daily limit`).toBe(TIER_LIMITS[tier].maxDaily);
    }
    expect(sql).toMatch(/FUNCTION public\.tier_caps\(p_tier INT\)[\s\S]*?FROM public\.tier_limits t/);
  });

  it("the web portals' TIER_LIMITS matches tier-math", () => {
    const ts = read("packages/shared/src/types/index.ts");
    const table = ts.slice(ts.indexOf("export const TIER_LIMITS"));

    for (const tier of [1, 2, 3] as const) {
      const block = table.slice(table.indexOf(`  ${tier}: {`));
      const single = block.match(/maxSingleTxn:\s*([\d_]+)/);
      const daily = block.match(/maxDailyVolume:\s*([\d_]+)/);

      expect(single, `no maxSingleTxn for tier ${tier}`).not.toBeNull();
      expect(daily, `no maxDailyVolume for tier ${tier}`).not.toBeNull();

      expect(num(single![1]), `tier ${tier} single limit`).toBe(TIER_LIMITS[tier].maxSingle);
      expect(num(daily![1]), `tier ${tier} daily limit`).toBe(TIER_LIMITS[tier].maxDaily);
    }
  });

  it("the mobile app's TIER_CAPS matches tier-math", () => {
    const tsx = read("mobile-app/src/lib/limitsView.ts");
    const table = tsx.slice(tsx.indexOf("const TIER_CAPS"));

    for (const tier of [1, 2, 3] as const) {
      const row = table.match(
        new RegExp(`${tier}:\\s*\\{\\s*maxSingle:\\s*([\\d_]+),\\s*maxDaily:\\s*([\\d_]+)`)
      );

      expect(row, `no TIER_CAPS row for tier ${tier}`).not.toBeNull();
      expect(num(row![1]), `tier ${tier} single limit`).toBe(TIER_LIMITS[tier].maxSingle);
      expect(num(row![2]), `tier ${tier} daily limit`).toBe(TIER_LIMITS[tier].maxDaily);
    }
  });

  it("Tier 2 is 150k single and 500k daily", () => {
    // Stated explicitly because it was changed once by mistake, and because a
    // silent edit to every copy at once would otherwise pass the tests above.
    expect(TIER_LIMITS[2].maxSingle).toBe(150_000);
    expect(TIER_LIMITS[2].maxDaily).toBe(500_000);
  });
});
