import clsx from "clsx";

interface LoadingStateProps {
  title?: string;
  description?: string;
  fullScreen?: boolean;
  minHeight?: string;
  className?: string;
}

/**
 * Loading: the MiliPay mark beating (design handoff, 1.3s). Full-page loads
 * show the mark alone on the page colour; loads inside a page show a smaller
 * mark with the title under it. The title is always there for screen readers.
 */
export function LoadingState({
  title = "Loading",
  description,
  fullScreen = false,
  minHeight = "min-h-[360px]",
  className,
}: LoadingStateProps) {
  if (fullScreen) {
    return (
      <div
        role="status"
        aria-live="polite"
        className={clsx("fixed inset-0 z-[96] flex animate-fade-in items-center justify-center bg-canvas", className)}
      >
        <img src="/brand/splash-mark.png" alt="" className="h-[120px] w-[120px] animate-heartbeat object-contain" />
        <span className="sr-only">{title}</span>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={clsx("flex w-full select-none flex-col items-center justify-center gap-3 p-6 text-center", minHeight, className)}
    >
      <img src="/brand/splash-mark.png" alt="" className="h-14 w-14 animate-heartbeat object-contain" />
      <div className="text-[13px] font-semibold text-muted">{title}</div>
      {description && <div className="max-w-sm text-xs text-faint">{description}</div>}
    </div>
  );
}
