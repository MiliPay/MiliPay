import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Banknote,
  Check,
  Gauge,
  Hand,
  Contact,
  Info,
  Landmark,
  Lock,
  MessageSquare,
  Percent,
  Plug,
  ScanFace,
  ShieldCheck,
  Signal,
  Smartphone,
  Tv,
  UserRoundPlus,
  Wifi,
  Zap,
  type LucideIcon,
} from "lucide-react";
import clsx from "clsx";
import { LoadingState } from "@milipay/shared/components/ui/LoadingState";
import { ReasonDialog, type ReasonDialogProps } from "@milipay/shared/components/ui/ReasonDialog";
import { Pill } from "@milipay/shared/components/ui/StatusBadge";
import { Switch } from "@milipay/shared/components/ui/Switch";
import { useToast } from "@milipay/shared/components/ui/Toast";
import {
  feeError,
  fetchIntegrations,
  fetchSettings,
  fetchVtuFees,
  savePlatformSettings,
  saveTierLimits,
  saveVtuFees,
  signupError,
  testTermii,
  tierError,
  type FeeDraft,
  type Integration,
  type PlatformSettings,
  type TierRow,
  type VtuFees,
} from "@milipay/shared/features/settings/api";

/**
 * Settings (design handoff, admin "Settings"). Platform rules; every change
 * needs a reason and is kept in the audit log.
 *
 * Only switches that change something are here. The design's Alerts tab,
 * the face-match thresholds, the NIN lockout, the second approver, the
 * office-IP rule and per-tier "Available" have nothing behind them yet, and
 * "Require a reason" and "Block bank accounts in another name" are always on.
 */

type Tab = "limits" | "signup" | "fees" | "security" | "integrations";
type DialogConfig = Omit<ReasonDialogProps, "open" | "onClose">;

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "limits", label: "Tier limits", icon: Gauge },
  { id: "signup", label: "Self sign-up", icon: UserRoundPlus },
  { id: "fees", label: "Fees and margins", icon: Percent },
  { id: "security", label: "Security", icon: ShieldCheck },
  { id: "integrations", label: "Integrations", icon: Plug },
];

const TIER_NAME: Record<number, [string, string]> = {
  1: ["Tier 1 · Basic", "Phone, NIN and selfie (self sign-up)"],
  2: ["Tier 2 · Enrolled", "NIN and palm scan confirmed"],
  3: ["Tier 3 · Enterprise", "BVN and verified address"],
};

const naira = (n: number) => (Number.isFinite(n) ? n.toLocaleString("en-NG") : "");
const digitsOnly = (v: string) => Number(v.replace(/[^0-9]/g, "")) || 0;

export default function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some((t) => t.id === params.get("tab")) ? params.get("tab") : "limits") as Tab;
  const { flash } = useToast();
  const [s, setS] = useState<PlatformSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogConfig | null>(null);

  const load = useCallback(async () => {
    try {
      setS(await fetchSettings());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load settings.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const confirm = (config: DialogConfig) => setDialog(config);
  const saved = async (message: string) => {
    setDialog(null);
    flash(message);
    await load();
  };

  return (
    <div className="flex max-w-[1280px] animate-fade-in flex-col gap-[18px] p-4 sm:p-7">
      <div>
        <h1 className="text-2xl font-bold tracking-[-.02em]">Settings</h1>
        <div className="mt-1 text-muted">Platform rules. Every change needs a reason and is kept in the audit log.</div>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="flex gap-0.5 overflow-x-auto lg:sticky lg:top-0 lg:flex-col" aria-label="Settings sections">
          {TABS.map((t) => {
            const on = t.id === tab;
            return (
              <button
                key={t.id}
                type="button"
                aria-current={on ? "page" : undefined}
                onClick={() => setParams(t.id === "limits" ? {} : { tab: t.id }, { replace: true })}
                className={clsx(
                  "flex h-[38px] flex-none items-center gap-2.5 whitespace-nowrap rounded-[10px] px-3",
                  on ? "bg-brand-soft font-semibold text-brand-text" : "font-medium text-muted hover:bg-hover",
                )}
              >
                <t.icon size={16} aria-hidden="true" />
                {t.label}
              </button>
            );
          })}
        </nav>
        <div className="flex min-w-0 flex-col gap-3.5">
          {error && <div className="rounded-xl bg-fail-soft p-3.5 text-[13px] text-fail">{error}</div>}
          {!s && !error && <LoadingState title="Loading settings" />}
          {s && tab === "limits" && <TierLimits s={s} confirm={confirm} saved={saved} />}
          {s && tab === "signup" && <SignupRules s={s} confirm={confirm} saved={saved} goLimits={() => setParams({}, { replace: true })} />}
          {s && tab === "fees" && <Fees s={s} confirm={confirm} saved={saved} />}
          {s && tab === "security" && <Security s={s} confirm={confirm} saved={saved} />}
          {tab === "integrations" && <Integrations />}
        </div>
      </div>
      {dialog && <ReasonDialog open onClose={() => setDialog(null)} {...dialog} />}
    </div>
  );
}

interface SectionProps {
  s: PlatformSettings;
  confirm: (c: DialogConfig) => void;
  saved: (message: string) => Promise<void>;
}

function Panel({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-panel shadow-card">
      <div className="px-5 pb-3 pt-[18px]">
        <h2 className="text-base font-bold">{title}</h2>
        <div className="mt-[3px] text-[13px] text-muted">{sub}</div>
      </div>
      {children}
    </div>
  );
}

function SaveBar({ changed, error, onDiscard, onSave, label }: { changed: boolean; error: string; onDiscard: () => void; onSave: () => void; label: string }) {
  const ready = changed && !error;
  return (
    <>
      {changed && error && <div className="mx-5 mb-1 rounded-[10px] bg-fail-soft px-3 py-2.5 text-[13px] text-fail">{error}</div>}
      <div className="flex flex-wrap items-center gap-2.5 border-t border-line px-5 py-3.5">
        <div className="flex-1 text-[13px] text-muted">{changed ? "Unsaved changes. You will be asked for a reason." : "No changes."}</div>
        <button
          type="button"
          onClick={onDiscard}
          disabled={!changed}
          className="flex h-[38px] items-center rounded-[10px] border border-line px-3.5 font-semibold disabled:opacity-40"
        >
          Discard
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!ready}
          className="flex h-[38px] items-center gap-2 rounded-[10px] bg-brand px-4 font-bold text-brand-ink disabled:opacity-40"
        >
          <Check size={16} strokeWidth={2.5} aria-hidden="true" />
          {label}
        </button>
      </div>
    </>
  );
}

function MoneyInput({ value, onChange, changed, label, prefix = "₦", suffix }: { value: string; onChange: (v: string) => void; changed: boolean; label: string; prefix?: string; suffix?: string }) {
  return (
    <span className={clsx("flex h-[38px] items-center gap-1 rounded-[9px] border bg-field px-2.5", changed ? "border-warn" : "border-line")}>
      {prefix && <span className="font-semibold text-muted">{prefix}</span>}
      <input
        aria-label={label}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-full min-w-0 flex-1 bg-transparent text-right font-semibold tabular-nums outline-none"
      />
      {suffix && <span className="whitespace-nowrap text-[13px] text-muted">{suffix}</span>}
    </span>
  );
}

// ── Tier limits ──────────────────────────────────────────────────────────
function TierLimits({ s, confirm, saved }: SectionProps) {
  const [draft, setDraft] = useState<TierRow[]>(s.tiers);
  useEffect(() => setDraft(s.tiers), [s.tiers]);
  const changedRows = draft.filter((d) => {
    const o = s.tiers.find((t) => t.tier === d.tier)!;
    return o.maxSingle !== d.maxSingle || o.maxDaily !== d.maxDaily || o.pinOver !== d.pinOver;
  });
  const err = tierError(draft);
  const set = (tier: number, k: "maxSingle" | "maxDaily" | "pinOver", v: string) =>
    setDraft((p) => p.map((t) => (t.tier === tier ? { ...t, [k]: digitsOnly(v) } : t)));

  return (
    <Panel title="Tier limits" sub="Customers can set their own limits below these ceilings in the app. The PIN amount is where a new customer in that tier starts.">
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-[minmax(0,1.4fr)_150px_150px_150px] gap-3.5 border-y border-line bg-field px-5 py-[9px] text-[11px] font-semibold uppercase tracking-[.06em] text-faint">
            <div>Tier</div>
            <div>Per payment</div>
            <div>Daily</div>
            <div>PIN required over</div>
          </div>
          {draft.map((t) => {
            const o = s.tiers.find((x) => x.tier === t.tier)!;
            return (
              <div key={t.tier} className="grid grid-cols-[minmax(0,1.4fr)_150px_150px_150px] items-center gap-3.5 border-b border-line2 px-5 py-3">
                <div>
                  <div className="font-semibold">{TIER_NAME[t.tier][0]}</div>
                  <div className="mt-0.5 text-xs text-muted">{TIER_NAME[t.tier][1]}</div>
                </div>
                <MoneyInput label={`Tier ${t.tier} per payment`} value={naira(t.maxSingle)} changed={t.maxSingle !== o.maxSingle} onChange={(v) => set(t.tier, "maxSingle", v)} />
                <MoneyInput label={`Tier ${t.tier} daily`} value={naira(t.maxDaily)} changed={t.maxDaily !== o.maxDaily} onChange={(v) => set(t.tier, "maxDaily", v)} />
                <MoneyInput label={`Tier ${t.tier} PIN required over`} value={naira(t.pinOver)} changed={t.pinOver !== o.pinOver} onChange={(v) => set(t.tier, "pinOver", v)} />
              </div>
            );
          })}
        </div>
      </div>
      <SaveBar
        changed={changedRows.length > 0}
        error={err}
        label="Save changes"
        onDiscard={() => setDraft(s.tiers)}
        onSave={() =>
          confirm({
            title: "Save tier limits?",
            body: "New limits apply to every customer in that tier on their next payment.",
            icon: Gauge,
            tone: "ok",
            confirmLabel: "Save limits",
            noteRequired: true,
            notePlaceholder: "Why are the limits changing?",
            onConfirm: async (note) => {
              await saveTierLimits(changedRows, note);
              await saved("Tier limits saved · logged");
            },
          })
        }
      />
    </Panel>
  );
}

// ── Self sign-up ─────────────────────────────────────────────────────────
function SignupRules({ s, confirm, saved, goLimits }: SectionProps & { goLimits: () => void }) {
  const [d, setD] = useState(s.signup);
  useEffect(() => setD(s.signup), [s.signup]);
  const changed = JSON.stringify(d) !== JSON.stringify(s.signup);
  const nums: { k: "selfieAttempts" | "abandonHours"; label: string; sub: string; unit: string }[] = [
    { k: "selfieAttempts", label: "Selfie attempts allowed", sub: "After the last failed attempt the sign-up goes to Sign-ups for review.", unit: "tries" },
    { k: "abandonHours", label: "Mark as abandoned after", sub: "No finished sign-up after this long moves it to Abandoned. A reminder SMS gives it another week.", unit: "hours" },
  ];
  return (
    <>
      <Panel
        title="Self sign-up"
        sub="Rules for people opening a Tier 1 account in the app. Smile ID checks the NIN and selfie; anything it flags goes to Sign-ups for review."
      >
        {nums.map((n) => (
          <div key={n.k} className="grid grid-cols-[minmax(0,1fr)_160px] items-center gap-4 border-t border-line2 px-5 py-3.5">
            <div>
              <div className="font-semibold">{n.label}</div>
              <div className="mt-0.5 text-xs leading-[1.45] text-muted">{n.sub}</div>
            </div>
            <MoneyInput label={n.label} prefix="" suffix={n.unit} value={String(d[n.k])} changed={d[n.k] !== s.signup[n.k]} onChange={(v) => setD({ ...d, [n.k]: digitsOnly(v) })} />
          </div>
        ))}
        <div className="grid grid-cols-[minmax(0,1fr)_160px] items-center gap-4 border-t border-line2 px-5 py-3.5">
          <div>
            <div className="font-semibold">Allow self sign-up in the app</div>
            <div className="mt-0.5 text-xs leading-[1.45] text-muted">When off, the app tells people to visit an agent instead of creating an account.</div>
          </div>
          <div className="flex justify-end">
            <Switch label="Allow self sign-up in the app" on={d.enabled} onChange={(enabled) => setD({ ...d, enabled })} />
          </div>
        </div>
        <SaveBar
          changed={changed}
          error={signupError(d)}
          label="Save rules"
          onDiscard={() => setD(s.signup)}
          onSave={() =>
            confirm({
              title: "Save sign-up rules?",
              body: "New rules apply to the next sign-up attempt.",
              icon: UserRoundPlus,
              tone: "ok",
              confirmLabel: "Save rules",
              noteRequired: true,
              notePlaceholder: "Why are the rules changing?",
              onConfirm: async (note) => {
                await savePlatformSettings("signup", d, note);
                await saved("Sign-up rules saved · logged");
              },
            })
          }
        />
      </Panel>
      <div className="flex gap-2.5 rounded-[14px] bg-info-soft px-4 py-3 text-[13px] leading-[1.45] text-info">
        <Info size={16} className="mt-px flex-none" aria-hidden="true" />
        <div>
          Tier 1 limits for self sign-ups are set in{" "}
          <button type="button" onClick={goLimits} className="font-bold underline">
            Tier limits
          </button>
          . Bank accounts in someone else's name are always refused for self sign-ups.
        </div>
      </div>
    </>
  );
}

// ── Fees and margins ─────────────────────────────────────────────────────
const FEE_ROWS: { k: keyof FeeDraft; label: string; sub: string; icon: LucideIcon; color: string; unit: "%" | "₦" }[] = [
  { k: "palm", label: "Palm payments (default)", sub: "Charged to the merchant per payment. New merchants start here; existing ones keep their own rate.", icon: Hand, color: "#00C896", unit: "%" },
  { k: "airtime", label: "Airtime", sub: "Added to the airtime price, per purchase", icon: Smartphone, color: "#10B981", unit: "%" },
  { k: "data", label: "Data", sub: "Added to the plan price, per purchase", icon: Wifi, color: "#3B82F6", unit: "₦" },
  { k: "electricity", label: "Electricity", sub: "Convenience fee added to the token amount", icon: Zap, color: "#F97316", unit: "₦" },
  { k: "cable", label: "Cable TV", sub: "Added to the package price, per purchase", icon: Tv, color: "#A855F7", unit: "₦" },
];

function Fees({ s, confirm, saved }: SectionProps) {
  const [vtu, setVtu] = useState<VtuFees | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const base = (v: VtuFees): FeeDraft => ({
    palm: String(s.defaultMerchantFee),
    airtime: String(v.airtime_surcharge_percent),
    data: String(v.data_surcharge_ngn),
    electricity: String(v.power_convenience_fee_ngn),
    cable: String(v.cable_surcharge_ngn),
  });
  const [d, setD] = useState<FeeDraft | null>(null);

  const load = useCallback(async () => {
    try {
      const v = await fetchVtuFees();
      setVtu(v);
      setD(base(v));
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load the fees.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.defaultMerchantFee]);

  useEffect(() => {
    void load();
  }, [load]);

  if (err) return <div className="rounded-xl bg-fail-soft p-3.5 text-[13px] text-fail">{err}</div>;
  if (!vtu || !d) return <LoadingState title="Loading fees" />;
  const orig = base(vtu);
  const changed = (Object.keys(d) as (keyof FeeDraft)[]).filter((k) => Number(d[k]) !== Number(orig[k]));

  return (
    <Panel title="Fees and margins" sub="What MiliPay earns on each payment. Prices shown to customers include these.">
      {FEE_ROWS.map((r) => (
        <div key={r.k} className="flex items-center gap-3.5 border-t border-line2 px-5 py-3">
          <div className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px]" style={{ background: `${r.color}24`, color: r.color }}>
            <r.icon size={16} aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold">{r.label}</div>
            <div className="text-xs text-muted">{r.sub}</div>
          </div>
          <div className="w-[120px]">
            <MoneyInput
              label={r.label}
              prefix={r.unit === "₦" ? "₦" : ""}
              suffix={r.unit === "%" ? "%" : undefined}
              value={d[r.k]}
              changed={changed.includes(r.k)}
              onChange={(v) => setD({ ...d, [r.k]: v.replace(/[^0-9.]/g, "").slice(0, r.unit === "%" ? 5 : 6) })}
            />
          </div>
        </div>
      ))}
      <SaveBar
        changed={changed.length > 0}
        error={feeError(d)}
        label="Save fees"
        onDiscard={() => setD(orig)}
        onSave={() =>
          confirm({
            title: "Save fees?",
            body: "New rates apply from the next transaction.",
            icon: Percent,
            tone: "ok",
            confirmLabel: "Save fees",
            noteRequired: true,
            notePlaceholder: "Why are the fees changing?",
            onConfirm: async (note) => {
              const vtuChanged = changed.some((k) => k !== "palm");
              if (vtuChanged) {
                await saveVtuFees(
                  {
                    airtime_surcharge_percent: Number(d.airtime),
                    data_surcharge_ngn: Number(d.data),
                    power_convenience_fee_ngn: Number(d.electricity),
                    cable_surcharge_ngn: Number(d.cable),
                  },
                  note,
                );
              }
              if (changed.includes("palm")) await savePlatformSettings("merchant_fee", { defaultMerchantFee: Number(d.palm) }, note);
              await saved("Fees saved · logged");
              await load();
            },
          })
        }
      />
    </Panel>
  );
}

// ── Security ─────────────────────────────────────────────────────────────
function Security({ s, confirm, saved }: SectionProps) {
  const rows: { k: "mfaRequired" | "idleSignOut"; label: string; sub: string }[] = [
    {
      k: "mfaRequired",
      label: "Require two-factor sign-in",
      sub: "All staff must use an authenticator app. Anyone who hasn't set one up is asked to on their next sign-in.",
    },
    { k: "idleSignOut", label: "Sign out after 15 minutes idle", sub: "Applies to the admin and support portals." },
  ];
  const cantTurnOnMfa = !s.security.mfaRequired && s.sessionAal !== "aal2";
  return (
    <Panel title="Security" sub="Rules for everyone who signs in to the MiliPay portals.">
      {rows.map((r) => {
        const on = s.security[r.k];
        const blocked = r.k === "mfaRequired" && cantTurnOnMfa;
        return (
          <div key={r.k} className="flex items-center gap-3.5 border-t border-line2 px-5 py-3.5">
            <div className="flex-1">
              <div className="font-semibold">{r.label}</div>
              <div className="mt-0.5 text-xs leading-[1.4] text-muted">
                {r.sub}
                {blocked && (
                  <span className="mt-1 block font-semibold text-warn">
                    Sign in with your own authenticator first, so turning this on can't lock you out.
                  </span>
                )}
              </div>
            </div>
            <Switch
              label={r.label}
              on={on}
              disabled={blocked}
              onChange={(next) =>
                confirm({
                  title: `${next ? "Turn on" : "Turn off"} "${r.label}"?`,
                  body:
                    r.k === "mfaRequired"
                      ? next
                        ? "Everyone must pass an authenticator code from their next request. Staff without one are asked to set it up."
                        : "Staff can sign in with only a password again."
                      : next
                        ? "Anyone idle for 15 minutes in the admin or support portal is signed out."
                        : "Idle sessions stay signed in.",
                  icon: ShieldCheck,
                  tone: next ? "ok" : "fail",
                  confirmLabel: next ? "Turn on" : "Turn off",
                  noteRequired: true,
                  onConfirm: async (note) => {
                    await savePlatformSettings("security", { [r.k]: next }, note);
                    await saved("Setting saved · logged");
                  },
                })
              }
            />
          </div>
        );
      })}
    </Panel>
  );
}

// ── Integrations ─────────────────────────────────────────────────────────
const INTEGRATION_ICON: Record<string, LucideIcon> = {
  landmark: Landmark,
  zap: Zap,
  signal: Signal,
  "message-square": MessageSquare,
  "scan-face": ScanFace,
  "id-card": Contact,
  hand: Hand,
  banknote: Banknote,
};

/** Sends one real SMS through Termii to your own phone (from My profile). */
function TermiiTest() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      const r = await testTermii();
      setResult({ ok: r.sent, text: r.sent ? `${r.detail}. Check your phone.` : `Termii said: ${r.detail}` });
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : "The test message wasn't sent." });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2.5 border-t border-line2 pt-2.5">
      <button type="button" onClick={() => void run()} disabled={busy} className="h-8 rounded-[9px] border border-line px-3 text-xs font-semibold disabled:opacity-60">
        {busy ? "Sending…" : "Text me a test"}
      </button>
      {result && <div className={clsx("min-w-0 flex-1 text-xs", result.ok ? "text-brand-text" : "text-fail")}>{result.text}</div>}
    </div>
  );
}

function Integrations() {
  const [list, setList] = useState<Integration[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetchIntegrations()
      .then(setList)
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not check the integrations."));
  }, []);
  if (err) return <div className="rounded-xl bg-fail-soft p-3.5 text-[13px] text-fail">{err}</div>;
  if (!list) return <LoadingState title="Checking integrations" />;
  return (
    <>
      <div className="grid gap-3.5 md:grid-cols-2">
        {list.map((g) => {
          const Icon = INTEGRATION_ICON[g.icon] ?? Plug;
          return (
            <div key={g.name} className="flex flex-col gap-2.5 rounded-2xl border border-line bg-panel px-[18px] py-4 shadow-card">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-chip text-muted">
                  <Icon size={18} aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold">{g.name}</div>
                  <div className="text-xs text-muted">{g.use}</div>
                </div>
                <Pill tone={g.tone}>{g.status}</Pill>
              </div>
              <div className="flex justify-between gap-3 text-xs text-muted">
                <div>{g.metric}</div>
                <div className="font-mono">{g.mode}</div>
              </div>
              {g.name === "Termii" && g.mode !== "OFF" && <TermiiTest />}
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 text-xs text-faint">
        <Lock size={13} aria-hidden="true" />
        Secret keys live only in server config and are never shown here.
      </div>
    </>
  );
}
