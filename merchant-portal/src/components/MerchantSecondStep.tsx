import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@milipay/shared/lib/supabase";
import { useAuth } from "@milipay/shared/features/auth/AuthContext";
import { ChannelPicker, type CodeChannel } from "@milipay/shared/features/codeChannels";

/**
 * The second step after the password (agreed 2026-10-20): a 6-digit code to
 * the account's own phone (SMS or a call) or its email, picked here. The
 * database enforces it (merchant_second_step_ok): until this sign-in has
 * passed, the merchant's pages would load nothing. This screen is how they
 * pass. Staff using the portal (a super admin) aren't asked.
 */

interface Status {
  required: boolean;
  passed: boolean;
  channels: CodeChannel[];
  phone: string | null;
  email: string | null;
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("merchant-code", { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const parsed = ctx && typeof ctx.json === "function" ? await ctx.json().catch(() => null) : null;
    throw new Error(parsed?.error || "That didn't work. Try again.");
  }
  if (!data?.success) throw new Error(data?.error || "That didn't work. Try again.");
  return data as T;
}

export function MerchantSecondStep({ children }: { children: ReactNode }) {
  const { logout } = useAuth();
  const [status, setStatus] = useState<Status | null>(null);
  const [channel, setChannel] = useState<CodeChannel>("sms");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const s = await call<Status>({ action: "status" });
      setStatus(s);
      if (s.channels?.length) setChannel(s.channels.includes("sms") ? "sms" : s.channels[0]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't check your sign-in.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (status && (!status.required || status.passed)) return <>{children}</>;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr("");
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const send = () =>
    run(async () => {
      if (requestId) {
        setSentTo((await call<{ sentTo: string }>({ action: "resend", requestId, channel })).sentTo);
      } else {
        const r = await call<{ requestId: string; sentTo: string }>({ action: "request", channel });
        setRequestId(r.requestId);
        setSentTo(r.sentTo);
      }
      setCode("");
    });

  const verify = () =>
    run(async () => {
      await call({ action: "verify", requestId, code });
      setStatus((s) => (s ? { ...s, passed: true } : s));
    });

  const input = "h-12 w-full rounded-[12px] border border-line bg-field px-4 text-center font-mono text-2xl tracking-[.4em] outline-none focus:border-brand";
  return (
    <div className="flex min-h-screen items-center justify-center bg-ledger p-4 text-ink">
      <div className="flex w-full max-w-[420px] flex-col gap-4 rounded-[20px] border border-line bg-panel p-6 shadow-pop">
        <div className="flex items-center gap-2.5">
          <ShieldCheck size={22} className="text-brand-text" aria-hidden="true" />
          <h1 className="text-lg font-bold">Confirm it's you</h1>
        </div>
        {!status ? (
          <div className="text-muted">{err || "Checking your sign-in…"}</div>
        ) : (
          <>
            <div className="text-[13px] leading-[1.5] text-muted">
              {requestId
                ? `We sent a 6-digit code to ${sentTo}. Enter it to open your dashboard.`
                : "For your security, we'll send a one-time code before showing your business data."}
            </div>
            <ChannelPicker offered={status.channels} value={channel} onChange={setChannel} label={requestId ? "Send a new code by" : "Get the code by"} disabled={busy} />
            {requestId && (
              <input
                className={input}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoFocus
                placeholder="000000"
                aria-label="Sign-in code"
              />
            )}
            {err && <div className="rounded-[10px] bg-fail-soft px-3 py-2.5 text-[13px] text-fail">{err}</div>}
            {requestId ? (
              <div className="flex gap-2">
                <button type="button" onClick={() => void send()} disabled={busy} className="h-11 flex-1 rounded-[10px] border border-line font-semibold disabled:opacity-50">
                  Send again
                </button>
                <button type="button" onClick={() => void verify()} disabled={busy || code.length !== 6} className="h-11 flex-1 rounded-[10px] bg-brand font-bold text-brand-ink disabled:opacity-50">
                  {busy ? "Checking…" : "Confirm"}
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => void send()} disabled={busy} className="h-11 rounded-[10px] bg-brand font-bold text-brand-ink disabled:opacity-50">
                {busy ? "Sending…" : "Send code"}
              </button>
            )}
            <button type="button" onClick={() => void logout()} className="text-[13px] font-semibold text-muted">
              Sign out
            </button>
          </>
        )}
      </div>
    </div>
  );
}
