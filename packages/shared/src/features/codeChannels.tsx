import { useEffect, useState } from "react";
import { Mail, MessageCircle, MessageSquare, PhoneCall } from "lucide-react";
import clsx from "clsx";
import { supabase } from "@milipay/shared/lib/supabase";

/**
 * How a customer's code reaches them when staff send it (an agent's or
 * admin's phone check, the Tier 2 upgrade): the customer says which, and
 * staff pick it. Only the phone ways (SMS, a call, WhatsApp), and only the
 * ones the server says are switched on (login-code `channels`). Not
 * remembered between customers: each starts on SMS.
 */

export type CodeChannel = "sms" | "call" | "email" | "whatsapp";
export type CodePurpose = "sign_in" | "password_reset" | "prove_phone" | "consent";

export const CHANNEL_LABEL: Record<CodeChannel, string> = { sms: "SMS", call: "Call", email: "Email", whatsapp: "WhatsApp" };
const ICON = { sms: MessageSquare, call: PhoneCall, email: Mail, whatsapp: MessageCircle } as const;
const ALL: CodeChannel[] = ["sms", "call", "email", "whatsapp"];

/** The ways the server offers for this purpose; SMS only when it can't be asked. */
export async function fetchChannels(purpose: CodePurpose): Promise<CodeChannel[]> {
  try {
    const { data, error } = await supabase.functions.invoke("login-code", { body: { action: "channels" } });
    const list = !error && data?.success ? (data.channels?.[purpose] as unknown) : null;
    const clean = Array.isArray(list) ? list.filter((c): c is CodeChannel => ALL.includes(c as CodeChannel)) : [];
    return clean.length ? clean : ["sms"];
  } catch {
    return ["sms"];
  }
}

export function useChannels(purpose: CodePurpose) {
  const [offered, setOffered] = useState<CodeChannel[]>(["sms"]);
  const [channel, setChannel] = useState<CodeChannel>("sms");
  useEffect(() => {
    let live = true;
    void fetchChannels(purpose).then((list) => {
      if (!live) return;
      setOffered(list);
      setChannel(list.includes("sms") ? "sms" : list[0]);
    });
    return () => {
      live = false;
    };
  }, [purpose]);
  return { offered, channel, setChannel };
}

/** "Send the code by": one button per way. Hidden when SMS is the only way. */
export function ChannelPicker({
  offered,
  value,
  onChange,
  label = "Send the code by",
  disabled,
}: {
  offered: CodeChannel[];
  value: CodeChannel;
  onChange: (c: CodeChannel) => void;
  label?: string;
  disabled?: boolean;
}) {
  if (offered.length < 2) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-muted">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {offered.map((c) => {
          const Icon = ICON[c];
          const on = c === value;
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={disabled}
              onClick={() => onChange(c)}
              className={clsx(
                "flex h-10 items-center gap-2 rounded-[10px] border-[1.5px] px-3.5 text-sm font-semibold disabled:opacity-45",
                on ? "border-brand bg-brand-soft text-brand-text" : "border-line text-fg",
              )}
            >
              <Icon size={16} aria-hidden="true" />
              {CHANNEL_LABEL[c]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
