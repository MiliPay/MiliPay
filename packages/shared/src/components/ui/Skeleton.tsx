import clsx from "clsx";

interface SkeletonProps {
  className?: string;
  variant?: "rectangular" | "circular" | "text";
}

export function Skeleton({ className, variant = "rectangular" }: SkeletonProps) {
  return (
    <div
      className={clsx(
        "relative overflow-hidden bg-white/[0.04] animate-pulse",
        variant === "circular" && "rounded-full",
        variant === "text" && "rounded h-4 w-full",
        variant === "rectangular" && "rounded-xl",
        className
      )}
    >
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/[0.06] to-transparent animate-[shimmer_2s_infinite]" />
    </div>
  );
}

interface TableSkeletonRowsProps {
  columns: number;
  rows?: number;
}

export function TableSkeletonRows({ columns, rows = 5 }: TableSkeletonRowsProps) {
  // Pre-determined realistic column widths to avoid robotic uniformity
  const widths = ["w-20", "w-36", "w-48", "w-28", "w-24", "w-16"];

  return (
    <>
      {Array.from({ length: rows }).map((_, rIdx) => (
        <tr key={`t-skel-${rIdx}`} className="border-b border-white/[0.03]">
          {Array.from({ length: columns }).map((_, cIdx) => (
            <td key={`c-skel-${cIdx}`} className="p-4">
              <div
                className={clsx(
                  "h-4 rounded bg-white/[0.05] animate-pulse",
                  widths[(cIdx + rIdx) % widths.length]
                )}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function MetricCardSkeleton() {
  return (
    <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-4 sm:p-5 backdrop-blur-xl animate-pulse space-y-3">
      <div className="flex items-center justify-between">
        <div className="h-3.5 w-24 bg-white/[0.05] rounded" />
        <div className="w-7 h-7 rounded-lg bg-white/[0.05]" />
      </div>
      <div className="h-7 w-20 bg-white/[0.08] rounded" />
      <div className="h-2.5 w-32 bg-white/[0.03] rounded" />
    </div>
  );
}

export function QueueItemSkeleton() {
  return (
    <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-4 sm:p-5 backdrop-blur-xl animate-pulse space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/[0.06]" />
          <div className="space-y-1.5">
            <div className="h-3.5 w-32 bg-white/[0.08] rounded" />
            <div className="h-2.5 w-20 bg-white/[0.04] rounded" />
          </div>
        </div>
        <div className="h-8 w-20 bg-white/[0.06] rounded-xl" />
      </div>
      <div className="h-3 w-3/4 bg-white/[0.04] rounded" />
    </div>
  );
}
