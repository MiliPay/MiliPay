import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { adminClient, handler, json, requireCaller, requireStaffRole } from "../_shared/auth.ts";
import { classifyGatewayUrl, classifyMonoKey, monoPaymentsSecret, resolveFulfilmentMode } from "../_shared/environment.ts";
import { verificationMode } from "../_shared/identity.ts";
import { sendTermiiTest, termiiHealth } from "../_shared/notify.ts";
import { termiiCard } from "./termii.ts";

/**
 * Settings › Integrations (design handoff): for each provider, whether it is
 * set up, whether it is live or in test mode, and what it has actually done
 * in the last 24 hours, from our own records.
 *
 * Only the fact that a secret is present is ever read, never its value, and
 * nothing here returns or logs one. ("Secret keys live only in server config
 * and are never shown here.")
 */

type Tone = "ok" | "warn" | "info" | "muted";
interface Integration {
  name: string;
  use: string;
  icon: string;
  status: string;
  tone: Tone;
  metric: string;
  mode: "LIVE" | "TEST" | "OFF";
}

const has = (k: string) => (Deno.env.get(k) ?? "").trim().length > 0;

function rate(rows: { status: string }[]): { done: number; failed: number } {
  let done = 0;
  let failed = 0;
  for (const r of rows) {
    if (r.status === "delivered") done++;
    else if (["fulfilment_failed", "refund_pending", "refunded", "refund_failed", "payment_failed"].includes(r.status)) failed++;
  }
  return { done, failed };
}

function providerCard(
  name: string,
  use: string,
  icon: string,
  configured: boolean,
  live: boolean,
  rows: { status: string }[],
): Integration {
  if (!configured) return { name, use, icon, status: "Not set up", tone: "muted", metric: "No keys in server config", mode: "OFF" };
  const { done, failed } = rate(rows);
  const total = done + failed;
  const pct = total ? Math.round((done / total) * 1000) / 10 : null;
  return {
    name,
    use,
    icon,
    status: !live ? "Test mode" : pct !== null && pct < 90 ? "Degraded" : "Operational",
    tone: !live ? "info" : pct !== null && pct < 90 ? "warn" : "ok",
    metric: total ? `${pct}% success · ${total.toLocaleString("en-NG")} in 24h` : "No sales in the last 24h",
    mode: live ? "LIVE" : "TEST",
  };
}

serve(handler(async (req) => {
  const caller = await requireCaller(req);
  const admin = adminClient();
  await requireStaffRole(admin, caller, ["admin", "super_admin"]);

  const body = await req.json().catch(() => ({}));
  if (body?.action === "test_termii") {
    // Only ever to the signed-in admin's own phone on their staff record.
    const { data: me } = await admin.from("staff_profiles").select("phone, full_name").eq("id", caller.id).maybeSingle();
    const phone = String(me?.phone ?? "");
    if (!/^(\+234|0)[789][01]\d{8}$/.test(phone)) {
      return json({ success: false, error: "Add your phone number in My profile first; the test goes there." }, 400);
    }
    const r = await sendTermiiTest(phone, `MiliPay test: Termii is sending messages for ${String(me?.full_name ?? "MiliPay")}. No action needed.`);
    console.log(`[platform-status] Termii test to ${phone.slice(0, 4)}•••${phone.slice(-3)}: ${r.ok ? "sent" : r.detail}`);
    return json({ success: true, sent: r.ok, detail: r.ok ? `Sent to ${phone.slice(0, 4)} ••• ${phone.slice(-4)}` : r.detail });
  }

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: txs } = await admin
    .from("transactions")
    .select("provider, status, payment_provider")
    .gte("created_at", since)
    .limit(10_000);
  const rows = (txs ?? []) as { provider: string | null; status: string; payment_provider: string | null }[];
  const { count: smileChecks } = await admin
    .from("signup_sessions")
    .select("id", { count: "exact", head: true })
    .gte("updated_at", since)
    .not("smile_job_id", "is", null);

  const mono = monoPaymentsSecret(Deno.env);
  const monoClass = classifyMonoKey(mono.key);
  const monoRows = rows.filter((r) => r.payment_provider === "mono");
  const monoPaid = monoRows.filter((r) => r.status !== "initiated" && r.status !== "payment_failed").length;
  const vtpassLive = classifyGatewayUrl(Deno.env.get("VTPASS_BASE_URL")) === "production" &&
    resolveFulfilmentMode(Deno.env.get("VTU_FULFILMENT_MODE")) === "live";
  const smileOn = has("SMILE_PARTNER_ID") && has("SMILE_API_KEY");
  const smileLive = (Deno.env.get("SMILE_ENVIRONMENT") ?? "").toLowerCase() === "production";
  const nimcLive = verificationMode() === "live";

  const integrations: Integration[] = [
    {
      name: "Mono",
      use: "Bank linking and debits",
      icon: "landmark",
      ...(mono.key
        ? {
            status: monoClass === "production" ? "Operational" : "Test mode",
            tone: (monoClass === "production" ? "ok" : "info") as Tone,
            mode: (monoClass === "production" ? "LIVE" : "TEST") as Integration["mode"],
          }
        : { status: "Not set up", tone: "muted" as Tone, mode: "OFF" as const }),
      metric: mono.key ? `${monoPaid.toLocaleString("en-NG")} paid of ${monoRows.length.toLocaleString("en-NG")} in 24h` : "No keys in server config",
    },
    providerCard("VTPass", "Airtime, data, bills", "zap", has("VTPASS_API_KEY") && has("VTPASS_SECRET_KEY") && has("VTPASS_BASE_URL"), vtpassLive, rows.filter((r) => r.provider === "vtpass")),
    termiiCard(await termiiHealth()),
    {
      name: "Smile ID",
      use: "Selfie and NIN check (self sign-up)",
      icon: "scan-face",
      status: smileOn ? (smileLive ? "Operational" : "Test mode") : "Not set up",
      tone: smileOn ? (smileLive ? "ok" : "info") : "muted",
      metric: smileOn ? `${(smileChecks ?? 0).toLocaleString("en-NG")} checks in 24h` : "Self sign-up selfies are off",
      mode: smileOn ? (smileLive ? "LIVE" : "TEST") : "OFF",
    },
    {
      name: "NIMC",
      use: "NIN verification (agents)",
      icon: "id-card",
      status: nimcLive ? "Operational" : "Simulated",
      tone: nimcLive ? "ok" : "muted",
      metric: nimcLive ? "Live lookups" : "Live lookup not configured",
      mode: nimcLive ? "LIVE" : "TEST",
    },
    {
      name: "Palm engine",
      use: "Vein matching",
      icon: "hand",
      status: has("PALM_MATCH_URL") ? "Set up" : "Not set up",
      tone: has("PALM_MATCH_URL") ? "ok" : "warn",
      metric: has("PALM_MATCH_URL") ? "Match service configured" : "Palm payments are declined until it is",
      mode: has("PALM_MATCH_URL") ? "LIVE" : "OFF",
    },
  ];

  return json({ success: true, integrations, checkedAt: new Date().toISOString() });
}));
