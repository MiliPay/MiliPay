import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./support/edge/fake-supabase";
import { notifyTransactionStatus } from "../supabase/functions/_shared/push";
import { CUSTOMER_STATUS_COPY } from "../supabase/functions/_shared/vtu-state";

/**
 * The customer's notification inbox, and the push banner that repeats it.
 *
 * The inbox is written by database triggers (migration
 * 20260927120000_customer_notifications), so every status change — from any
 * Edge Function, a palm terminal or an administrator — lands in it. The banner
 * sends the inbox entry's own words, so the two can never tell different
 * stories about one purchase.
 */

const MIGRATION = readFileSync(
  join(__dirname, "..", "supabase", "migrations", "20260927120000_customer_notifications.sql"),
  "utf8",
);

/** The body of one CREATE FUNCTION in the migration. */
function fn(name: string): string {
  const start = MIGRATION.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  const body = MIGRATION.indexOf("AS $$", start);
  return MIGRATION.slice(start, MIGRATION.indexOf("$$;", body + 5));
}

describe("the push banner says what the inbox says", () => {
  afterEach(() => vi.unstubAllGlobals());

  function setup(notes: Record<string, unknown>[]) {
    const db = new FakeSupabase({
      customer_notifications: notes,
      push_tokens: [{ id: "pt-1", user_id: "user-1", token: "ExponentPushToken[abc]", revoked_at: null }],
    });
    const sent: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        sent.push(...JSON.parse(init.body));
        return new Response(JSON.stringify({ data: [{ status: "ok" }] }), { status: 200 });
      }),
    );
    return { db, sent };
  }

  it("sends the inbox entry's title and body", async () => {
    const { db, sent } = setup([
      { reference: "MP-1", status: "delivered", title: "Airtime delivered", body: "₦1,000 MTN Airtime sent to 0803 123 4567." },
    ]);
    await notifyTransactionStatus(db as never, { userId: "user-1", status: "delivered", reference: "MP-1" });
    expect(sent).toEqual([
      expect.objectContaining({
        to: "ExponentPushToken[abc]",
        title: "Airtime delivered",
        body: "₦1,000 MTN Airtime sent to 0803 123 4567.",
        data: { reference: "MP-1", status: "delivered" },
      }),
    ]);
  });

  it("stays silent when the inbox has nothing for that state", async () => {
    // initiated, paid, fulfilling and refund_pending get no inbox entry.
    const { db, sent } = setup([{ reference: "MP-1", status: "delivered", title: "t", body: "b" }]);
    await notifyTransactionStatus(db as never, { userId: "user-1", status: "paid", reference: "MP-1" });
    await notifyTransactionStatus(db as never, { userId: "user-1", status: "delivered", reference: "MP-2" });
    expect(sent).toEqual([]);
  });

  it("never throws, even when Expo is unreachable", async () => {
    const db = new FakeSupabase({
      customer_notifications: [{ reference: "MP-1", status: "delivered", title: "t", body: "b" }],
      push_tokens: [{ id: "pt-1", user_id: "user-1", token: "ExponentPushToken[abc]", revoked_at: null }],
    });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      notifyTransactionStatus(db as never, { userId: "user-1", status: "delivered", reference: "MP-1" }),
    ).resolves.toBeUndefined();
  });
});

describe("what the database writes", () => {
  const notice = fn("transaction_notice");
  const branches = [...notice.matchAll(/p_status = '([a-z_]+)'/g)].map((m) => m[1]);

  it("has words for every ending worth a notification, and none for the passing states", () => {
    const every = Object.keys(CUSTOMER_STATUS_COPY);
    const silent = ["initiated", "paid", "fulfilling", "refund_pending"];
    expect(new Set(branches)).toEqual(new Set(every.filter((s) => !silent.includes(s))));
  });

  it("only a delivered purchase is called delivered or paid", () => {
    const delivered = notice.slice(notice.indexOf("p_status = 'delivered'"), notice.indexOf("ELSIF p_status = 'fulfilment_pending'"));
    const rest = notice.slice(notice.indexOf("ELSIF p_status = 'fulfilment_pending'"));
    expect(delivered).toMatch(/Airtime delivered/);
    expect(rest).not.toMatch(/delivered'|paid'|You paid/);
  });

  it("a payment that never went through says nothing was charged, and does not blame the bank", () => {
    const failed = notice.slice(notice.indexOf("p_status = 'payment_failed'"), notice.indexOf("ELSIF p_status = 'fulfilment_failed'"));
    expect(failed).toMatch(/Nothing was charged/);
    expect(MIGRATION).not.toMatch(/bank (declined|rejected)|declined by your bank|your bank could not/i);
  });

  it("a notification can never stop money moving: every trigger catches its own errors", () => {
    for (const name of ["notify_customer", "notify_transaction_change", "notify_bank_link_change", "notify_credential_change"]) {
      expect(fn(name), name).toMatch(/EXCEPTION WHEN OTHERS THEN\s+RAISE WARNING/);
    }
  });

  it("customers can only read their own, and change nothing but the read mark", () => {
    expect(MIGRATION).toMatch(/REVOKE ALL ON public\.customer_notifications FROM anon, authenticated;/);
    expect(MIGRATION).toMatch(/GRANT SELECT ON public\.customer_notifications TO authenticated;/);
    expect(MIGRATION).not.toMatch(/GRANT (INSERT|UPDATE|DELETE)[^;]*customer_notifications/);
    expect(MIGRATION).toMatch(/USING \(user_id = auth\.uid\(\)\)/);
    expect(fn("mark_notifications_read")).toMatch(/WHERE user_id = v_uid/);
    for (const internal of ["notify_customer", "transaction_notice", "naira_label", "phone_label"]) {
      expect(MIGRATION, internal).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${internal}\\([^)]*\\)\\s+FROM PUBLIC, anon, authenticated;`));
    }
  });

  it("the same state never lands in the inbox twice", () => {
    expect(MIGRATION).toMatch(/UNIQUE INDEX IF NOT EXISTS customer_notifications_once_per_state\s+ON public\.customer_notifications \(reference, status\)/);
    expect(fn("notify_customer")).toMatch(/ON CONFLICT DO NOTHING/);
  });

  it("first-time set-up is not news; a later change is", () => {
    const creds = fn("notify_credential_change");
    expect(creds).toMatch(/OLD\.pin_hash IS NOT NULL AND NEW\.pin_hash IS DISTINCT FROM OLD\.pin_hash/);
    expect(creds).toMatch(/OLD\.password_changed_at IS NOT NULL/);
  });
});
