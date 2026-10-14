import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { ApiError, adminClient, handler, json } from "../_shared/auth.ts";
import { AGENT_FIELDS, ALL_STATES, MERCHANT_FIELDS, WAITLIST_ERROR, checkForm, waitlistPhone } from "../_shared/website.ts";

/**
 * The marketing website's backend (design handoff, MiliPay Website). Visitors
 * are not signed in, so this runs without a JWT; every write is validated
 * with the same rules the site uses and rate-limited per address.
 *
 *   POST /waitlist             {phone}      "Notify me" while the app isn't in the stores
 *   POST /merchant-leads       the Business page's terminal application
 *   POST /agent-applications   the Agents page's application
 *   GET  /agents?state=Lagos   published agent locations for "Find an agent"
 */

function callerAddress(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
}

async function rateLimit(admin: SupabaseClient, key: string, limit: number, windowSeconds: number) {
  const { data, error } = await admin.rpc("consume_rate_limit", { p_key: key, p_limit: limit, p_window_seconds: windowSeconds });
  if (error) {
    console.error("[website] rate limit check failed", error);
    throw new ApiError("This isn't available right now. Please try again shortly.", 503, "UNAVAILABLE");
  }
  if (data === false) throw new ApiError("Too many attempts. Please wait a while and try again.", 429, "RATE_LIMITED");
}

async function body(req: Request): Promise<Record<string, unknown>> {
  const b = await req.json().catch(() => null);
  return b && typeof b === "object" ? (b as Record<string, unknown>) : {};
}

function invalid(errors: Record<string, string>): never {
  throw new ApiError("Check the highlighted fields.", 400, "VALIDATION_FAILED", { errors });
}

serve(handler(async (req) => {
  const route = new URL(req.url).pathname.replace(/\/+$/, "").split("/").pop() ?? "";
  const admin = adminClient();
  const address = callerAddress(req);

  if (route === "agents" && req.method === "GET") {
    const state = new URL(req.url).searchParams.get("state") ?? "";
    if (!(ALL_STATES as readonly string[]).includes(state)) throw new ApiError("Choose a state.", 400, "BAD_STATE");
    await rateLimit(admin, `website:agents:${address}`, 120, 60 * 60);
    const { data, error } = await admin
      .from("agent_locations")
      .select("name, address, hours")
      .eq("state", state)
      .eq("active", true)
      .order("position", { ascending: true })
      .order("name", { ascending: true })
      .limit(50);
    if (error) throw new ApiError("The agent list isn't available right now.", 503, "UNAVAILABLE");
    return json({ success: true, agents: data ?? [] });
  }

  if (req.method !== "POST") throw new ApiError("Method not allowed", 405, "METHOD_NOT_ALLOWED");
  const input = await body(req);

  if (route === "waitlist") {
    const phone = waitlistPhone(input.phone);
    if (!phone) invalid({ phone: WAITLIST_ERROR });
    await rateLimit(admin, `website:waitlist:${address}`, 10, 60 * 60);
    const page = typeof input.page === "string" ? input.page.slice(0, 40) : null;
    // Signing up twice is fine: the number is already on the list.
    const { error } = await admin.from("website_waitlist").upsert({ phone, page }, { onConflict: "phone", ignoreDuplicates: true });
    if (error) {
      console.error("[website] waitlist not saved", error.message);
      throw new ApiError("We couldn't save your number. Please try again.", 503, "UNAVAILABLE");
    }
    return json({ success: true });
  }

  if (route === "merchant-leads") {
    const checked = checkForm(MERCHANT_FIELDS, input);
    if (!checked.ok) invalid(checked.errors);
    await rateLimit(admin, `website:merchant:${address}`, 5, 60 * 60);
    const v = checked.values;
    const { error } = await admin.from("merchant_leads").insert({
      business_name: v.biz,
      cac_number: v.rc,
      business_type: v.type,
      contact_name: v.contact,
      phone: v.phone,
      email: v.email.toLowerCase(),
      state: v.state,
      tills: v.tills,
      settlement_bank: v.bank,
    });
    if (error) {
      console.error("[website] merchant lead not saved", error.message);
      throw new ApiError("We couldn't send your application. Please try again.", 503, "UNAVAILABLE");
    }
    return json({ success: true });
  }

  if (route === "agent-applications") {
    const checked = checkForm(AGENT_FIELDS, input);
    if (!checked.ok) invalid(checked.errors);
    await rateLimit(admin, `website:agent:${address}`, 5, 60 * 60);
    const v = checked.values;
    const { error } = await admin.from("agent_applications").insert({
      full_name: v.name,
      phone: v.phone,
      email: v.email.toLowerCase(),
      state: v.state,
      area: v.area,
      workplace: v.place,
    });
    if (error) {
      console.error("[website] agent application not saved", error.message);
      throw new ApiError("We couldn't send your application. Please try again.", 503, "UNAVAILABLE");
    }
    return json({ success: true });
  }

  throw new ApiError("Not found", 404, "NOT_FOUND");
}));
