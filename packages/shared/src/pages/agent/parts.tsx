import { useState, type ReactNode } from "react";
import { Hand, Loader2, ScanFace } from "lucide-react";
import { registerPalm } from "@milipay/shared/features/biometrics/palmScanner";
import { captureFaceTemplate } from "@milipay/shared/features/biometrics/faceScanner";
import { QUALITY_MIN } from "@milipay/shared/features/agent/api";

export interface Captured {
  template: string;
  /** 0–100. */
  quality: number;
  simulated: boolean;
}

/**
 * Capture a palm or a face from the enrolment device (simulated in a plain
 * browser). Only the quality score is shown; templates go to the server.
 */
export function CaptureTile({ kind, value, onChange }: { kind: "palm" | "face"; value: Captured | null; onChange: (c: Captured | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const Icon = kind === "palm" ? Hand : ScanFace;
  const capture = async () => {
    setBusy(true);
    setError(null);
    try {
      if (kind === "palm") {
        const p = await registerPalm();
        onChange({ template: p.template, quality: Math.round(p.qualityScore * 100), simulated: p.simulated });
      } else {
        const f = await captureFaceTemplate();
        onChange({ template: f.template, quality: Math.round(f.score * 100), simulated: f.simulated });
      }
    } catch (e) {
      onChange(null);
      setError(e instanceof Error ? e.message : "Capture failed. Try again.");
    } finally {
      setBusy(false);
    }
  };
  const low = value !== null && value.quality < QUALITY_MIN;
  return (
    <div className="rounded-[18px] border border-line bg-field p-5">
      <div className="flex items-center gap-4">
        <span className={`flex h-14 w-14 flex-none items-center justify-center rounded-2xl ${value && !low ? "bg-brand-soft text-brand-text" : "bg-chip text-muted"}`}>
          {busy ? <Loader2 size={26} className="animate-spin" /> : <Icon size={26} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-fg">{kind === "palm" ? "Palm scan" : "Face photo"}</div>
          <div className={`text-[13px] ${low ? "text-fail" : "text-muted"}`}>
            {busy
              ? kind === "palm"
                ? "Hold the right palm flat, 5 cm above the scanner…"
                : "Look straight at the camera…"
              : value
                ? `Quality ${value.quality}/100${value.simulated ? " · simulated" : ""}${low ? ` · needs ${QUALITY_MIN} or more` : ""}`
                : "Not captured yet"}
          </div>
        </div>
        <button
          type="button"
          onClick={capture}
          disabled={busy}
          className="h-10 rounded-[12px] border border-line px-4 text-[13px] font-semibold text-fg hover:bg-hover disabled:opacity-50"
        >
          {value ? "Capture again" : kind === "palm" ? "Scan palm" : "Take photo"}
        </button>
      </div>
      {error && <div className="mt-3 text-[13px] text-fail">{error}</div>}
    </div>
  );
}

/**
 * Small pieces the agent pages share (design handoff, agent portal): the page
 * header, a card, a KPI tile, an empty or error line.
 */

export function PageHeader({ title, sub, right }: { title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[26px] font-bold tracking-[-0.02em] text-fg">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Panel({ children, className = "", onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  const cls = `rounded-[20px] border border-line bg-panel p-5 ${onClick ? "cursor-pointer text-left transition hover:border-brand/50" : ""} ${className}`;
  return onClick ? (
    <button type="button" onClick={onClick} className={cls}>
      {children}
    </button>
  ) : (
    <div className={cls}>{children}</div>
  );
}

export function Kpi({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "brand" | "warn" }) {
  return (
    <Panel>
      <div className="text-xs font-semibold uppercase tracking-[.06em] text-faint">{label}</div>
      <div className={`mt-2 text-[28px] font-bold tracking-[-0.02em] ${tone === "brand" ? "text-brand-text" : tone === "warn" ? "text-warn" : "text-fg"}`}>
        {value}
      </div>
      {sub && <div className="mt-1 text-[13px] text-muted">{sub}</div>}
    </Panel>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold text-fg">{children}</h2>
      {right}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-[14px] border border-dashed border-line px-4 py-8 text-center text-sm text-muted">{children}</div>;
}

export function ErrorLine({ children }: { children: ReactNode }) {
  return <div className="rounded-[12px] bg-fail-soft px-4 py-3 text-sm text-fail" role="alert">{children}</div>;
}

/** A grid that fits as many N-wide columns as the width allows (handoff). */
export function AutoGrid({ min, children, className = "" }: { min: number; children: ReactNode; className?: string }) {
  return (
    <div className={`grid gap-4 ${className}`} style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))` }}>
      {children}
    </div>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">{children}</div>;
}
