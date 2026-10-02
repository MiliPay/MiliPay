import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";

/**
 * The design's toast: one dark pill at the bottom centre for 2.6 seconds,
 * e.g. "MP-4FZK9X refund started · logged". AppShell provides it.
 */

interface ToastValue {
  flash: (message: string, tone?: "ok" | "fail") => void;
}

const ToastContext = createContext<ToastValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; tone: "ok" | "fail"; key: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const flash = useCallback((message: string, tone: "ok" | "fail" = "ok") => {
    clearTimeout(timer.current);
    setToast({ message, tone, key: Date.now() });
    timer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={{ flash }}>
      {children}
      {toast && (
        <div
          key={toast.key}
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-7 left-1/2 z-[90] flex -translate-x-1/2 animate-rise-in items-center gap-2.5 rounded-xl bg-[#0B1A15] px-4 py-3 font-medium text-[#E8FFF6] shadow-[0_12px_30px_rgba(0,0,0,.25)]"
        >
          <span className={toast.tone === "ok" ? "flex text-[#33E0B5]" : "flex text-[#FF5C5C]"}>
            {toast.tone === "ok" ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}
          </span>
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  );
}

/** Outside a provider (a page rendered on its own), toasts are dropped. */
export function useToast(): ToastValue {
  return useContext(ToastContext) ?? { flash: () => {} };
}
