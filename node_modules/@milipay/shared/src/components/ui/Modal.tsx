import { useEffect, useRef, useCallback, type ReactNode } from "react";
import { X } from "lucide-react";

type ModalSize = "sm" | "md" | "lg" | "xl" | "2xl";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: ModalSize;
}

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-3xl",
  "2xl": "max-w-4xl",
};

export function Modal({ isOpen, onClose, title, children, size = "md" }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDialogElement>) => {
      if (e.target === dialogRef.current) {
        onClose();
      }
    },
    [onClose]
  );

  const handleCancel = useCallback(
    (e: React.SyntheticEvent<HTMLDialogElement>) => {
      e.preventDefault();
      onClose();
    },
    [onClose]
  );

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      onCancel={handleCancel}
      className={`
        ${SIZE_CLASSES[size]} w-[calc(100%-2rem)] sm:w-full p-0 bg-transparent m-auto max-h-[90vh]
        backdrop:bg-black/75 backdrop:backdrop-blur-sm outline-none
      `}
    >
      <div className="bg-ledger-raised border border-ledger-line rounded-2xl p-4 sm:p-6 max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between mb-4 shrink-0">
          <h2 className="text-base sm:text-lg font-display font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-faint hover:text-ink transition-colors p-1.5 rounded-xl hover:bg-white/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 pr-0.5 custom-scrollbar">
          {children}
        </div>
      </div>
    </dialog>
  );
}
