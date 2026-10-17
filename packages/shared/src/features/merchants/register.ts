/**
 * Register merchant (design handoff): the draft, the check for each of the
 * five steps, and what goes to onboard-merchant. Kept apart from the page so
 * the rules can be tested; the server checks all of it again.
 */

export interface MerchantForm {
  biz: string;
  rc: string;
  addr: string;
  cat: string;
  state: string;
  dir: string;
  dphone: string;
  dbvn: string;
  email: string;
  bank: string;
  acct: string;
  /** From the bank, when it answered. */
  acctName: string | null;
  /** Typed in, only when the bank couldn't be asked. */
  acctNameTyped: string;
  fee: string;
  schedule: "instant" | "daily_eod";
  tid: string;
  serial: string;
  model: string;
}

export const EMPTY_MERCHANT_FORM: MerchantForm = {
  biz: "",
  rc: "",
  addr: "",
  cat: "",
  state: "",
  dir: "",
  dphone: "",
  dbvn: "",
  email: "",
  bank: "",
  acct: "",
  acctName: null,
  acctNameTyped: "",
  fee: "1.2",
  schedule: "instant",
  tid: "",
  serial: "",
  model: "",
};

export const PHONE_NG = /^0[789][01]\d{8}$/;
export const TERMINAL_ID = /^[A-Z0-9][A-Z0-9-]{2,39}$/;

/** The settlement account name we'll use: the bank's, else the one typed. */
export const accountName = (f: MerchantForm) => f.acctName ?? f.acctNameTyped.trim().toUpperCase();

/** What's wrong with step `step` (0–3), or "" when it can go on. */
export function merchantStepError(step: number, f: MerchantForm, lookup: "idle" | "checking" | "done"): string {
  if (step === 0) {
    if (!f.biz.trim()) return "Enter the business name.";
    if (!f.cat) return "Choose a category.";
    if (!f.state) return "Choose a state.";
    if (!f.addr.trim()) return "Enter the business address.";
  }
  if (step === 1) {
    if (!f.dir.trim()) return "Enter the director's name.";
    if (!PHONE_NG.test(f.dphone)) return "Enter a valid director phone number.";
    if (!/^\d{11}$/.test(f.dbvn)) return "BVN must be 11 digits.";
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) return "Enter a valid login email.";
  }
  if (step === 2) {
    if (!f.bank) return "Choose the settlement bank.";
    if (!/^\d{10}$/.test(f.acct)) return "Enter a 10-digit account number.";
    if (lookup === "checking") return "Checking the account name with the bank…";
    if (!accountName(f)) return "Type the name on the account.";
    const fee = parseFloat(f.fee);
    if (!(fee > 0 && fee <= 5)) return "Fee must be between 0 and 5%.";
  }
  if (step === 3) {
    if (!TERMINAL_ID.test(f.tid)) return "Enter the terminal ID printed on the device, like TRM-1234.";
    if (!f.serial.trim()) return "Enter the serial number.";
    if (!f.model) return "Choose the device model.";
  }
  return "";
}

export function onboardingBody(f: MerchantForm, bankCode: string) {
  return {
    action: "create" as const,
    businessName: f.biz.trim(),
    category: f.cat,
    address: f.addr.trim(),
    state: f.state,
    cacRcNumber: f.rc.trim() || null,
    directorName: f.dir.trim(),
    directorPhone: f.dphone,
    directorBvn: f.dbvn,
    email: f.email.trim().toLowerCase(),
    settlementBankName: f.bank,
    settlementBankCode: bankCode,
    settlementAccountNumber: f.acct,
    settlementAccountName: f.acctName ? null : f.acctNameTyped.trim(),
    platformFeePercent: parseFloat(f.fee),
    settlementSchedule: f.schedule,
    terminalId: f.tid,
    deviceSerialNumber: f.serial.trim(),
    deviceModel: f.model,
  };
}

/** The agent portal's first terminal: one from their stock, or none yet. */
export type AgentTerminalChoice = { mode: "stock"; id: string; terminalId: string } | { mode: "later" };

/** What's wrong with the agent's step `step` (0 business, 1 bank, 2 location, 3 terminal), or "". */
export function agentMerchantStepError(step: number, f: MerchantForm, lookup: "idle" | "checking" | "done", terminal: AgentTerminalChoice | null): string {
  if (step === 0) {
    if (!f.biz.trim()) return "Enter the business name.";
    if (!f.cat) return "Choose the type of business.";
    if (!f.dir.trim()) return "Enter the owner's name.";
    if (!PHONE_NG.test(f.dphone)) return "Enter a valid owner phone number.";
    if (!/^\d{11}$/.test(f.dbvn)) return "BVN must be 11 digits.";
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) return "Enter a valid login email.";
  }
  if (step === 1) {
    if (!f.bank) return "Choose the settlement bank.";
    if (!/^\d{10}$/.test(f.acct)) return "Enter a 10-digit account number.";
    if (lookup === "checking") return "Checking the account name with the bank…";
    if (lookup === "idle" && !f.acctName) return "Tap Check account name.";
    if (!accountName(f)) return "Type the name on the account.";
  }
  if (step === 2) {
    if (!f.state) return "Choose a state.";
    if (!f.addr.trim()) return "Enter the business address.";
  }
  if (step === 3 && !terminal) return "Pick a terminal from your stock, or Assign later.";
  return "";
}

export function agentOnboardingBody(
  f: MerchantForm,
  bankCode: string,
  terminal: AgentTerminalChoice,
  location: { latitude: number; longitude: number } | null,
) {
  const { terminalId: _t, deviceSerialNumber: _s, deviceModel: _m, ...base } = onboardingBody(f, bankCode);
  return {
    ...base,
    terminalMode: terminal.mode,
    ...(terminal.mode === "stock" ? { stockTerminalId: terminal.id } : {}),
    ...(location ?? {}),
  };
}
