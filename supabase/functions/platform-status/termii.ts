import type { TermiiHealth } from "../_shared/notify.ts";

/** One card on Settings › Integrations (same shape as index.ts). */
export interface IntegrationCard {
  name: string;
  use: string;
  icon: string;
  status: string;
  tone: "ok" | "warn" | "info" | "muted";
  metric: string;
  mode: "LIVE" | "TEST" | "OFF";
}

/** The Termii card from what Termii itself says (balance, sender ID). */
export function termiiCard(h: TermiiHealth): IntegrationCard {
  const card = { name: "Termii", use: "SMS and WhatsApp codes", icon: "message-square" };
  const money = h.balance !== null ? `${h.currency === "NGN" || !h.currency ? "₦" : `${h.currency} `}${h.balance.toLocaleString("en-NG")} balance` : "";
  switch (h.state) {
    case "off":
      return { ...card, status: "Not set up", tone: "muted", metric: "Codes print to the server log only", mode: "OFF" };
    case "unreachable":
      return { ...card, status: "Can't reach Termii", tone: "warn", metric: "Check TERMII_BASE_URL (your Termii dashboard shows it)", mode: "OFF" };
    case "key_rejected":
      return { ...card, status: "Key rejected", tone: "warn", metric: "Termii refused TERMII_API_KEY", mode: "OFF" };
    case "sender_missing":
      return { ...card, status: "No sender ID", tone: "warn", metric: `Register sender ID "${h.sender}" on Termii · ${money}`, mode: "LIVE" };
    case "sender_pending":
      return { ...card, status: "Sender ID pending", tone: "warn", metric: `"${h.sender}" awaits Termii's approval · ${money}`, mode: "LIVE" };
    case "sender_blocked":
      return { ...card, status: "Sender ID blocked", tone: "warn", metric: `Termii blocked "${h.sender}" · ${money}`, mode: "LIVE" };
    case "no_balance":
      return { ...card, status: "No credit", tone: "warn", metric: `Top up Termii · ${money}`, mode: "LIVE" };
    default:
      return { ...card, status: "Operational", tone: "ok", metric: `Sender "${h.sender}" approved · ${money}`, mode: "LIVE" };
  }
}
