/**
 * The website's calls to the `website` Edge Function. Visitors aren't signed
 * in and the function needs no key, so these are plain fetches.
 */

const BASE = `${(import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "")}/functions/v1/website`;

export interface ApiFailure {
  ok: false;
  message: string;
  errors?: Record<string, string>;
}
export type ApiResult<T = object> = ({ ok: true } & T) | ApiFailure;

/** This project's tsconfig isn't strict, so `ok` alone doesn't narrow the union. */
export const failed = (r: ApiResult<unknown>): r is ApiFailure => r.ok === false;

async function call<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${BASE}/${path}`, init);
    const body = await res.json().catch(() => ({}));
    if (res.ok && body?.success) return { ok: true, ...(body as T) };
    return {
      ok: false,
      message: typeof body?.error === "string" ? body.error : "Something went wrong. Please try again.",
      errors: body?.errors,
    };
  } catch {
    return { ok: false, message: "We couldn't reach MiliPay. Check your connection and try again." };
  }
}

const post = <T = object>(path: string, data: unknown) =>
  call<T>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });

export const joinWaitlist = (phone: string, page: string) => post("waitlist", { phone, page });
export const sendMerchantLead = (values: Record<string, string>) => post("merchant-leads", values);
export const sendAgentApplication = (values: Record<string, string>) => post("agent-applications", values);

export interface AgentLocation {
  name: string;
  address: string;
  hours: string | null;
}
export const agentsIn = (state: string) => call<{ agents: AgentLocation[] }>(`agents?state=${encodeURIComponent(state)}`);
