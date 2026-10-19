/**
 * How a one-time code reaches the customer: they pick SMS (the default), a
 * call, email or WhatsApp, among the ways the server says are switched on
 * and suit the code (login-code `channels`). The last choice is remembered
 * on this phone and offered first next time (codeChannels.ts).
 *
 * Pure: the screens' tests import exactly this.
 *
 *   sign_in, password_reset   any of them (email only to a verified address)
 *   prove_phone, consent      phone ways only: the code proves the number
 */

export type CodeChannel = 'sms' | 'call' | 'email' | 'whatsapp';
export type CodePurpose = 'sign_in' | 'password_reset' | 'prove_phone' | 'consent';
export type ChannelMenu = Record<CodePurpose, CodeChannel[]>;

export const CHANNEL_LABEL: Record<CodeChannel, string> = {
  sms: 'SMS',
  call: 'Call me',
  email: 'Email',
  whatsapp: 'WhatsApp',
};

/** What the code screen says once it was sent: "We texted …", "We're calling …". */
export function sentLine(channel: CodeChannel, sentTo: string | null): string {
  const to = sentTo || 'you';
  if (channel === 'call') return `We're calling ${to} now. The code is read out twice.`;
  if (channel === 'email') return `We emailed a code to ${to}.`;
  if (channel === 'whatsapp') return `We sent a code on WhatsApp to ${to}.`;
  return `We texted a code to ${to}.`;
}

/** When the server can't be asked: SMS only, which always works. */
export const SMS_ONLY: ChannelMenu = { sign_in: ['sms'], password_reset: ['sms'], prove_phone: ['sms'], consent: ['sms'] };

const ALL: CodeChannel[] = ['sms', 'call', 'email', 'whatsapp'];

/** The menu the server sent, cleaned; SMS_ONLY for anything unreadable. */
export function readMenu(raw: unknown): ChannelMenu {
  if (!raw || typeof raw !== 'object') return SMS_ONLY;
  const out = { ...SMS_ONLY };
  for (const purpose of Object.keys(SMS_ONLY) as CodePurpose[]) {
    const list = (raw as Record<string, unknown>)[purpose];
    if (Array.isArray(list)) {
      const clean = list.filter((c): c is CodeChannel => ALL.includes(c as CodeChannel));
      if (clean.length) out[purpose] = clean;
    }
  }
  return out;
}

/** The choice to start on: the remembered one if it's offered here, else SMS, else the first. */
export function initialChannel(offered: CodeChannel[], remembered: CodeChannel | null): CodeChannel {
  if (remembered && offered.includes(remembered)) return remembered;
  return offered.includes('sms') ? 'sms' : offered[0] ?? 'sms';
}

