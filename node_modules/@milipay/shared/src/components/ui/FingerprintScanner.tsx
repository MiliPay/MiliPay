import { Check, Fingerprint } from "lucide-react";

type ScanState = "idle" | "scanning" | "captured";

interface FingerprintScannerProps {
  state: ScanState;
  onScan: () => void;
  size?: "md" | "lg";
}

const SIZE_MAP = {
  md: { wrapper: "w-16 h-16", icon: "w-7 h-7" },
  lg: { wrapper: "w-24 h-24", icon: "w-10 h-10" },
};

export function FingerprintScanner({ state, onScan, size = "md" }: FingerprintScannerProps) {
  const dims = SIZE_MAP[size];
  const interactive = state === "idle";

  return (
    <button
      type="button"
      onClick={interactive ? onScan : undefined}
      disabled={!interactive}
      aria-label={
        state === "captured"
          ? "Fingerprint captured"
          : state === "scanning"
          ? "Scanning fingerprint"
          : "Tap to scan fingerprint"
      }
      className={`relative ${dims.wrapper} flex items-center justify-center ${
        interactive ? "cursor-pointer" : "cursor-default"
      } focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal focus-visible:outline-offset-4 rounded-full`}
    >
      {state === "scanning" && (
        <>
          <span className="absolute inset-0 rounded-full border border-signal-bright/40 animate-ring-pulse" />
          <span
            className="absolute inset-0 rounded-full border border-signal-bright/40 animate-ring-pulse"
            style={{ animationDelay: "0.5s" }}
          />
        </>
      )}

      <span
        className={`relative ${dims.wrapper} rounded-full flex items-center justify-center border overflow-hidden transition-colors ${
          state === "captured"
            ? "border-status-ok bg-status-ok/10"
            : state === "scanning"
            ? "border-signal-bright bg-signal/10"
            : "border-ledger-line2 bg-white/[0.02]"
        }`}
      >
        {state === "scanning" && (
          <span className="absolute left-1 right-1 h-px bg-signal-bright animate-scan-sweep" />
        )}
        {state === "captured" ? (
          <Check className={`${dims.icon} text-status-ok`} />
        ) : (
          <Fingerprint className={`${dims.icon} ${state === "scanning" ? "text-signal-bright" : "text-ink-faint"}`} />
        )}
      </span>
    </button>
  );
}