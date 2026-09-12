import { useEffect, useCallback, useState } from "react";
import { LogOut, X, ShieldAlert, Lock } from "lucide-react";
import { Button } from "@milipay/shared/components/ui/Button";

interface LogoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  portalName?: string;
  user?: {
    fullName?: string;
    email?: string;
    role?: string;
  } | null;
}

export function LogoutModal({
  isOpen,
  onClose,
  onConfirm,
  portalName = "MiliPay Portal",
  user,
}: LogoutModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Lock body scroll and handle Escape key
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, isSubmitting, onClose]);

  const handleConfirm = useCallback(async () => {
    setIsSubmitting(true);
    try {
      await onConfirm();
    } catch (error) {
      console.error("Logout error:", error);
      setIsSubmitting(false);
    }
  }, [onConfirm]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="logout-modal-title"
    >
      {/* Backdrop click dismiss */}
      <div
        className="fixed inset-0"
        aria-hidden="true"
        onClick={() => !isSubmitting && onClose()}
      />

      <div className="relative w-full max-w-md bg-ledger-raised border border-ledger-line rounded-2xl p-6 sm:p-7 shadow-2xl space-y-5 z-10 animate-rise-in">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          aria-label="Close dialog"
          className="absolute top-4 right-4 text-ink-muted hover:text-ink transition-colors p-1.5 rounded-xl hover:bg-white/[0.05] disabled:opacity-40"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Icon Emblem */}
        <div className="flex flex-col items-center text-center space-y-3 pt-1">
          <div className="relative">
            <div className="w-14 h-14 rounded-2xl bg-status-fail/10 border border-status-fail/30 flex items-center justify-center text-status-fail shadow-[0_0_25px_rgba(var(--color-status-fail),0.25)]">
              <LogOut className="w-7 h-7" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-ledger border border-ledger-line flex items-center justify-center text-status-warn">
              <ShieldAlert className="w-3 h-3" />
            </div>
          </div>

          <div>
            <h2
              id="logout-modal-title"
              className="text-lg sm:text-xl font-display font-bold text-ink tracking-tight"
            >
              Sign Out of Terminal?
            </h2>
            <p className="text-xs sm:text-sm text-ink-muted mt-1 leading-relaxed max-w-xs mx-auto">
              You are about to terminate your active session on{" "}
              <span className="text-ink font-semibold">{portalName}</span>.
            </p>
          </div>
        </div>

        {/* User Snapshot Card */}
        {user && (
          <div className="p-3.5 rounded-xl bg-ledger border border-ledger-line flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-signal/15 border border-signal/25 flex items-center justify-center text-signal font-display font-bold text-sm shrink-0">
              {user.fullName?.charAt(0).toUpperCase() || "U"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-medium text-ink truncate">
                {user.fullName || "Staff Member"}
              </p>
              <p className="text-[11px] text-ink-muted font-mono truncate">
                {user.email || "staff@milipayz.com"}
              </p>
            </div>
            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-white/[0.05] text-signal border border-signal/20 shrink-0">
              {user.role?.replace("_", " ")}
            </span>
          </div>
        )}

        {/* Terminal Security Notice */}
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-status-warn/5 border border-status-warn/15 text-left">
          <Lock className="w-4 h-4 text-status-warn shrink-0 mt-0.5" />
          <p className="text-[11px] text-ink-muted leading-snug">
            Encrypted session keys and biometric cache on this device will be purged. You will need your password to log back in.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-full py-2.5 text-xs sm:text-sm rounded-xl"
          >
            Stay Signed In
          </Button>

          <Button
            type="button"
            variant="danger"
            onClick={handleConfirm}
            isLoading={isSubmitting}
            disabled={isSubmitting}
            className="w-full py-2.5 text-xs sm:text-sm rounded-xl"
          >
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}
