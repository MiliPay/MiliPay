import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { resendPhoneCheck, sendPhoneCheck, verifyPhoneCheck } from "@milipay/shared/features/agent/api";
import { ChannelPicker, useChannels } from "@milipay/shared/features/codeChannels";

/**
 * Proving the customer holds the phone being registered: a code goes to it
 * (SMS, a call or WhatsApp, as the customer prefers) and they read it out.
 * enrol-customer refuses a registration without this confirmed check, for
 * admins as well as agents (since 2026-10-20). `checkId` is set only once
 * the code is right; a change of number clears it.
 */
export function PhoneCheckBox({
  phone,
  confirmedId,
  onConfirmed,
}: {
  phone: string;
  confirmedId: string | null;
  onConfirmed: (checkId: string | null) => void;
}) {
  const channels = useChannels("prove_phone");
  const [checkId, setCheckId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ready = /^0[789][01]\d{8}$/.test(phone);

  // A different number needs a fresh check.
  useEffect(() => {
    setCheckId(null);
    setCode("");
    setErr("");
  }, [phone]);

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

  if (confirmedId) {
    return (
      <div className="flex items-center gap-2 rounded-[12px] bg-brand-soft px-4 py-3 text-sm text-brand-text">
        <ShieldCheck size={18} aria-hidden="true" /> Phone checked: the customer read back the code.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-[12px] border border-line p-4">
      <div className="text-[13px] text-muted">Check the phone is theirs: we send a code, they read it to you.</div>
      <ChannelPicker offered={channels.offered} value={channels.channel} onChange={channels.setChannel} label="How should they get the code?" disabled={busy} />
      {!checkId ? (
        <button
          type="button"
          disabled={!ready || busy}
          onClick={() => run(async () => setCheckId((await sendPhoneCheck(phone, channels.channel)).checkId))}
          className="h-11 w-max rounded-[10px] bg-brand px-4 text-sm font-bold text-brand-ink disabled:opacity-45"
        >
          {busy ? "Sending…" : ready ? "Send code" : "Enter the phone number first"}
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            placeholder="000000"
            aria-label="Code from the customer"
            className="h-11 w-[160px] rounded-[10px] border border-line bg-field px-3 text-center font-mono text-lg tracking-[.3em] outline-none focus:border-brand"
          />
          <button
            type="button"
            disabled={code.length !== 6 || busy}
            onClick={() =>
              run(async () => {
                await verifyPhoneCheck(checkId, code);
                onConfirmed(checkId);
              })
            }
            className="h-11 rounded-[10px] bg-brand px-4 text-sm font-bold text-brand-ink disabled:opacity-45"
          >
            Confirm
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(async () => void (await resendPhoneCheck(checkId, channels.channel)))}
            className="h-11 rounded-[10px] border border-line px-3 text-sm font-semibold disabled:opacity-45"
          >
            Send a new code
          </button>
        </div>
      )}
      {err && <div className="rounded-[10px] bg-fail-soft px-3 py-2 text-[13px] text-fail">{err}</div>}
    </div>
  );
}
