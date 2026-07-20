import {
  createContext,
  useContext,
  useCallback,
  useState,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { CheckCircle, AlertCircle, Info } from "lucide-react";

/* ─── Types ─────────────────────────────────────────────── */

type ToastType = "success" | "error" | "info";

interface ToastOptions {
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastEntry extends ToastOptions {
  id: string;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => void;
}

/* ─── Styling config ────────────────────────────────────── */

const TYPE_CLASSES: Record<ToastType, string> = {
  success: "bg-status-ok/10 border-status-ok/30 text-status-ok",
  error: "bg-status-fail/10 border-status-fail/30 text-status-fail",
  info: "bg-signal/10 border-signal/30 text-signal-bright",
};

const TYPE_ICON: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
};

const MAX_VISIBLE = 3;
const DEFAULT_DURATION = 4000;

/* ─── Context ───────────────────────────────────────────── */

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a <ToastProvider>");
  }
  return ctx;
}

/* ─── Single toast item ─────────────────────────────────── */

function ToastItem({
  entry,
  onDismiss,
}: {
  entry: ToastEntry;
  onDismiss: (id: string) => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const Icon = TYPE_ICON[entry.type];

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      onDismiss(entry.id);
    }, entry.duration ?? DEFAULT_DURATION);

    return () => clearTimeout(timerRef.current);
  }, [entry.id, entry.duration, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`
        rounded-lg border px-4 py-3 flex items-center gap-3 shadow-lg animate-rise-in
        ${TYPE_CLASSES[entry.type]}
      `}
    >
      <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
      <p className="text-sm font-body">{entry.message}</p>
    </div>
  );
}

/* ─── Provider ──────────────────────────────────────────── */

let idCounter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const toast = useCallback((options: ToastOptions) => {
    const id = `toast-${++idCounter}`;
    setToasts((prev) => [...prev.slice(-(MAX_VISIBLE - 1)), { ...options, id }]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {createPortal(
        <div
          aria-label="Notifications"
          className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-auto"
        >
          {toasts.map((entry) => (
            <ToastItem key={entry.id} entry={entry} onDismiss={dismiss} />
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}
