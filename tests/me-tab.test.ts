import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  PIN_PRESETS,
  TIER_CAPS,
  limitsError,
  parseAmount,
  amountText,
  pinCeiling,
  spentToday,
  tierStatus,
} from "../mobile-app/src/lib/limitsView";
import { TIER_LIMITS } from "../supabase/functions/_shared/tier-math";

/**
 * The Me tab (redesign phase 4): Account limits, Your limits, Linked banks,
 * Change PIN and Profile & identity — the rules that keep them honest.
 */

const ROOT = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const code = (rel: string) => {
  const kind = rel.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts
    .createPrinter({ removeComments: true })
    .printFile(ts.createSourceFile(rel, read(rel), ts.ScriptTarget.Latest, true, kind));
};
const MIGRATION = read("supabase/migrations/20260928090000_me_tab_contact_change_and_limits.sql");

describe("limits", () => {
  it("the app's ceilings are the server's", () => {
    for (const tier of [1, 2, 3]) {
      expect(TIER_CAPS[tier]).toEqual({ maxSingle: TIER_LIMITS[tier].maxSingle, maxDaily: TIER_LIMITS[tier].maxDaily });
    }
  });

  it("refuses, in the design's words, what the server would", () => {
    expect(limitsError(0, 100, 2)).toBe("Limits must be greater than zero.");
    expect(limitsError(150_001, 500_000, 2)).toBe("Per-payment limit cannot exceed your Tier 2 cap of ₦150,000.");
    expect(limitsError(100, 500_001, 2)).toBe("Daily limit cannot exceed your Tier 2 cap of ₦500,000.");
    expect(limitsError(20_000, 10_000, 2)).toBe("Per-payment limit cannot be more than your daily limit.");
    expect(limitsError(50_000, 200_000, 2)).toBeNull();
    expect(limitsError(60_000, 200_000, 1)).toMatch(/Tier 1 cap of ₦50,000/);
  });

  it("the PIN amount cannot be above a single payment", () => {
    expect(pinCeiling(2, null)).toBe(150_000);
    expect(pinCeiling(2, 20_000)).toBe(20_000);
    expect(PIN_PRESETS).toEqual([5000, 10000, 25000, 50000, 150000]);
  });

  it("reads and writes ₦ fields", () => {
    expect(parseAmount("150,000")).toBe(150_000);
    expect(parseAmount("₦ 1,2x3")).toBe(123);
    expect(amountText(150000)).toBe("150,000");
    expect(amountText(0)).toBe("");
  });

  it("spent today, and what is left", () => {
    expect(spentToday(4500, 500_000)).toEqual({
      usedLabel: "₦4,500 of ₦500,000",
      leftLabel: "₦495,500 left today · resets at midnight",
      fraction: 0.009,
    });
    expect(spentToday(600_000, 500_000).leftLabel).toMatch(/^₦0 left/);
    expect(spentToday(600_000, 500_000).fraction).toBe(1);
  });

  it("tiers: done, current, not yet", () => {
    expect([1, 2, 3].map((t) => tierStatus(t, 2))).toEqual(["Completed", "Current", "Coming soon"]);
    expect([1, 2, 3].map((t) => tierStatus(t, 1))).toEqual(["Current", "Next step", "Coming soon"]);
  });

  it("'spent today' on screen is the figure that enforces the cap", () => {
    expect(code("mobile-app/src/screens/main/AccountLimitsScreen.tsx")).toMatch(/supabase\.rpc\('get_my_daily_spend'\)/);
    expect(MIGRATION).toMatch(/RETURN public\.get_customer_daily_spend\(coalesce\(v_customer, v_uid\)\)/);
    expect(read("supabase/functions/_shared/limits.ts")).toMatch(/rpc\("get_customer_daily_spend"/);
  });
});

describe("the daily limit is enforced again", () => {
  const fn = MIGRATION.slice(
    MIGRATION.indexOf("CREATE OR REPLACE FUNCTION public.get_customer_daily_spend"),
    MIGRATION.indexOf("-- ─── 2."),
  );

  it("counts the rail's statuses, not the retired 'success'", () => {
    // It counted only status = 'success', which no row has had since the
    // payment rail — so "spent today" was always ₦0 and no daily cap bit.
    expect(fn).not.toMatch(/status = 'success'/);
    for (const s of ["paid", "fulfilling", "fulfilment_pending", "delivered", "fulfilment_failed", "refund_pending", "refund_failed", "quarantined"]) {
      expect(fn, s).toContain(`'${s}'`);
    }
  });

  it("never counts money that was not taken or came back", () => {
    const list = fn.slice(fn.indexOf("status IN ("), fn.indexOf(")", fn.indexOf("status IN (")));
    expect(list).not.toMatch(/payment_failed|refunded'|'initiated'/);
    // A purchase still at the bank counts only while it is fresh.
    expect(fn).toMatch(/status = 'initiated' AND created_at > NOW\(\) - INTERVAL '30 minutes'/);
  });
});

describe("linked banks", () => {
  it("the last account cannot be unlinked, on the phone or on the server", () => {
    expect(code("mobile-app/src/components/me/LinkedBanksSheet.tsx")).toMatch(/accounts\.length > 1 \? \(<PressScale/);
    expect(MIGRATION).toMatch(/IF v_active <= 1 THEN[\s\S]*'LAST_ACCOUNT'/);
    // Counted under a lock, so two unlinks at once cannot both succeed.
    expect(MIGRATION).toMatch(/FOR UPDATE;\s+SELECT count\(\*\) INTO v_active/);
  });

  it("an account leaves the list only when the server says it is unlinked", () => {
    const store = code("mobile-app/src/store/useStore.ts");
    const unlink = store.slice(store.indexOf("unlinkAccount: async"), store.indexOf("linkMonoAccount: async"));
    expect(unlink.length).toBeGreaterThan(200);
    expect(unlink).toMatch(/if \(error \|\| !data\?\.success\) \{[\s\S]*return \{/);
    expect(unlink.indexOf("filter((acc) => acc.id !== id)")).toBeGreaterThan(unlink.indexOf("if (error || !data?.success)"));
    expect(unlink).not.toMatch(/finally/);
  });

  it("bank linking still goes through Mono's own widget, after the identity check", () => {
    const linking = code("mobile-app/src/components/banks/BankLinking.tsx");
    expect(linking).toMatch(/<MonoProvider/);
    expect(linking).toMatch(/<ConfirmIdentitySheet[\s\S]*onConfirmed=\{\(\) => \{[\s\S]*init\(\);/);
  });
});

describe("email and phone change only by a code", () => {
  it("the app no longer writes them directly", () => {
    const store = code("mobile-app/src/store/useStore.ts");
    const update = store.slice(store.indexOf("updateProfile: async"), store.indexOf("applyVerifiedContact: (contact) =>"));
    expect(update.length).toBeGreaterThan(200);
    expect(update).not.toMatch(/payload\.email|payload\.phone/);
  });

  it("and the database refuses it from the customer's own session", () => {
    expect(MIGRATION).toMatch(/BEFORE UPDATE OF email, phone ON public\.customers/);
    expect(MIGRATION).toMatch(/auth\.uid\(\) = OLD\.auth_user_id/);
    expect(MIGRATION).toMatch(/REVOKE ALL ON public\.contact_change_requests FROM anon, authenticated;/);
  });

  it("the profile screen asks for the code before anything is saved", () => {
    const screen = code("mobile-app/src/screens/main/ProfileSettingsScreen.tsx");
    // With a contact change, save() starts the codes and stops; the details
    // are saved in finish(), after the server says every code was right.
    const save = screen.slice(screen.indexOf("const save = async"), screen.indexOf("const finish = async"));
    expect(save.length).toBeGreaterThan(200);
    expect(save).toMatch(/startContactChange/);
    expect(save.indexOf("startContactChange")).toBeGreaterThan(save.indexOf("if (!emailChanged && !phoneChanged)"));
    const finish = screen.slice(screen.indexOf("const finish = async"), screen.indexOf("const discard"));
    expect(finish.length).toBeGreaterThan(50);
    expect(finish).toMatch(/applyVerifiedContact\(saved\)[\s\S]*saveDetails\(\)/);
    // Closing the sheet discards the request.
    expect(screen).toMatch(/const discard = \(\) => \{[\s\S]*cancelContactChange/);
  });
});

describe("change PIN", () => {
  it("is behind the identity check, and saved by the server's own rules", () => {
    const me = code("mobile-app/src/screens/main/SettingsScreen.tsx");
    expect(me).toMatch(/<ConfirmIdentitySheet visible=\{confirmingPin\}[\s\S]*navigation\.navigate\('ChangePin'\)/);
    expect(code("mobile-app/src/navigation/TabNavigator.tsx")).toMatch(/name="ChangePin" component=\{ChangePinScreen\}/);
    expect(code("mobile-app/src/screens/main/ChangePinScreen.tsx")).toMatch(/await setPin\(pin\)/);
  });
});
