import { useState, useCallback, type ReactNode } from "react";
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sortable?: boolean;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  emptyMessage?: string;
  emptyIcon?: ReactNode;
  page?: number;
  pageSize?: number;
  totalCount?: number;
  onPageChange?: (page: number) => void;
  onRowClick?: (row: T) => void;
  rowKey: (row: T) => string;
}

type SortDir = "asc" | "desc";

export function DataTable<T>({
  columns,
  data,
  isLoading,
  emptyMessage = "No data found",
  emptyIcon,
  page = 1,
  pageSize = 10,
  totalCount,
  onPageChange,
  onRowClick,
  rowKey,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = useCallback(
    (key: string) => {
      if (sortKey === key) {
        setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("asc");
      }
    },
    [sortKey]
  );

  const total = totalCount ?? data.length;
  const rangeStart = Math.min((page - 1) * pageSize + 1, total);
  const rangeEnd = Math.min(page * pageSize, total);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <div className="border border-ledger-line rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-ledger-raised">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wide ${
                    col.sortable ? "cursor-pointer select-none" : ""
                  } ${col.className ?? ""}`}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                  aria-sort={
                    sortKey === col.key
                      ? sortDir === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {col.sortable && (
                      <span className="inline-flex flex-col -space-y-1" aria-hidden="true">
                        <ChevronUp
                          className={`w-3 h-3 ${
                            sortKey === col.key && sortDir === "asc"
                              ? "text-signal-bright"
                              : "text-ink-faint"
                          }`}
                        />
                        <ChevronDown
                          className={`w-3 h-3 ${
                            sortKey === col.key && sortDir === "desc"
                              ? "text-signal-bright"
                              : "text-ink-faint"
                          }`}
                        />
                      </span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-ledger-line">
            {/* Loading skeleton */}
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`skeleton-${i}`}>
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3">
                      <div className="h-4 w-3/4 rounded bg-white/[0.06] animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))}

            {/* Empty state */}
            {!isLoading && data.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-16 text-center">
                  <div className="flex flex-col items-center gap-3 text-ink-faint">
                    {emptyIcon && (
                      <span className="text-ink-faint" aria-hidden="true">
                        {emptyIcon}
                      </span>
                    )}
                    <p className="text-sm">{emptyMessage}</p>
                  </div>
                </td>
              </tr>
            )}

            {/* Data rows */}
            {!isLoading &&
              data.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`transition-colors ${
                    onRowClick
                      ? "hover:bg-white/[0.02] cursor-pointer"
                      : ""
                  }`}
                  tabIndex={onRowClick ? 0 : undefined}
                  role={onRowClick ? "button" : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onRowClick(row);
                          }
                        }
                      : undefined
                  }
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-3 text-sm text-ink ${col.className ?? ""}`}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Pagination footer */}
      {total > 0 && (
        <div className="flex items-center justify-between border-t border-ledger-line bg-ledger-raised px-4 py-3">
          <p className="text-xs text-ink-muted font-data">
            Showing {rangeStart}–{rangeEnd} of {total}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={!hasPrev}
              onClick={() => onPageChange?.(page - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
              Prev
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!hasNext}
              onClick={() => onPageChange?.(page + 1)}
              aria-label="Next page"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
