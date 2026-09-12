import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable, type Column } from "@milipay/shared/components/ui/DataTable";
import { FilterChips } from "@milipay/shared/components/ui/FilterChips";
import { StatusBadge } from "@milipay/shared/components/ui/StatusBadge";
import { fetchTransactions } from "@milipay/shared/features/transactions/api";
import { formatNaira, formatDate, formatTimestamp } from "@milipay/shared/lib/utils/format";
import type { Transaction, TransactionStatus, PaginatedResult } from "@milipay/shared/types";

type DateRange = "today" | "7d" | "30d" | "all";

export default function TransactionsPage() {
  const [data, setData] = useState<PaginatedResult<Transaction> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<TransactionStatus | "all">("all");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      setIsLoading(true);
      try {
        const result = await fetchTransactions({ 
          page, 
          pageSize: 15, 
          status: statusFilter === "all" ? "" : statusFilter,
          dateRange
        });
        if (!cancelled) setData(result);
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    loadData();
    return () => { cancelled = true; };
  }, [page, statusFilter, dateRange]);

  const columns: Column<Transaction>[] = [
    {
      key: "reference",
      header: "Reference",
      render: (row) => <span className="font-data text-xs text-signal-bright">{row.reference}</span>,
    },
    {
      key: "customer",
      header: "Customer",
      render: (row) => <span className="text-sm text-ink">{row.customerName}</span>,
    },
    {
      key: "merchant",
      header: "Merchant",
      render: (row) => <span className="text-sm text-ink-muted">{row.merchantName}</span>,
    },
    {
      key: "amount",
      header: "Amount",
      render: (row) => <span className="font-data text-sm text-ink">{formatNaira(row.amountKobo)}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: "date",
      header: "Date",
      render: (row) => (
        <div className="flex flex-col">
          <span className="text-sm text-ink">{formatDate(row.timestamp)}</span>
          <span className="text-xs text-ink-faint">{formatTimestamp(row.timestamp)}</span>
        </div>
      ),
    },
  ];

  return (
    <div className="p-4 sm:p-6 md:p-10 max-w-6xl mx-auto animate-rise-in">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-display font-bold text-ink">Transactions</h1>
        <p className="text-ink-muted text-xs sm:text-sm mt-1">Monitor payment activity across the network.</p>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mb-6">
        <FilterChips
          options={[
            { label: "All Status", value: "all" },
            { label: "Success", value: "success" },
            { label: "Pending", value: "pending" },
            { label: "Failed", value: "failed" },
          ]}
          selected={statusFilter}
          onChange={(val) => { setStatusFilter(val as TransactionStatus | "all"); setPage(1); }}
        />
        <div className="w-px h-6 bg-ledger-line hidden md:block mx-2" />
        <FilterChips
          options={[
            { label: "All Time", value: "all" },
            { label: "Today", value: "today" },
            { label: "Last 7 Days", value: "7d" },
            { label: "Last 30 Days", value: "30d" },
          ]}
          selected={dateRange}
          onChange={(val) => { setDateRange(val as DateRange); setPage(1); }}
        />
      </div>

      <DataTable
        columns={columns}
        data={data?.items || []}
        isLoading={isLoading}
        page={data?.page}
        pageSize={data?.pageSize}
        totalCount={data?.totalCount}
        onPageChange={setPage}
        onRowClick={(row) => navigate(`/dashboard/transactions/${row.id}`)}
        rowKey={(row) => row.id}
        emptyMessage="No transactions found."
      />
    </div>
  );
}
