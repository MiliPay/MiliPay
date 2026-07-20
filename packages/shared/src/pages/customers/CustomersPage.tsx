import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable, type Column } from "@biopay/shared/components/ui/DataTable";
import { SearchInput } from "@biopay/shared/components/ui/SearchInput";
import { FilterChips } from "@biopay/shared/components/ui/FilterChips";
import { StatusBadge } from "@biopay/shared/components/ui/StatusBadge";
import { fetchCustomers } from "@biopay/shared/features/customers/api";
import { formatDate } from "@biopay/shared/lib/utils/format";
import type { Customer, CustomerStatus, PaginatedResult } from "@biopay/shared/types";

export default function CustomersPage() {
  const [data, setData] = useState<PaginatedResult<Customer> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CustomerStatus | "all">("all");
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      setIsLoading(true);
      try {
        const result = await fetchCustomers({ 
          page, 
          pageSize: 10, 
          search, 
          status: statusFilter === "all" ? "" : statusFilter 
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
  }, [page, search, statusFilter]);

  const columns: Column<Customer>[] = [
    {
      key: "name",
      header: "Name",
      render: (row) => <span className="text-sm font-medium text-ink">{row.fullName}</span>,
    },
    {
      key: "phone",
      header: "Phone",
      render: (row) => <span className="font-data text-sm text-ink-muted">{row.phone}</span>,
    },
    {
      key: "state",
      header: "State",
      render: (row) => <span className="text-sm text-ink-muted">{row.state}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: "registered",
      header: "Registered",
      render: (row) => <span className="text-sm text-ink-faint">{formatDate(row.createdAt)}</span>,
    },
    {
      key: "accounts",
      header: "Accounts",
      render: (row) => (
        <span className="font-data text-sm text-ink-muted bg-white/[0.04] px-2 py-0.5 rounded">
          {row.linkedAccountCount}
        </span>
      ),
    },
  ];

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto animate-rise-in">
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-ink">Customers</h1>
        <p className="text-ink-muted mt-1">Manage registered customers across the network.</p>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="w-full md:w-80">
          <SearchInput 
            onSearch={(val) => { setSearch(val); setPage(1); }} 
            placeholder="Search by name or phone..." 
          />
        </div>
        <FilterChips
          options={[
            { label: "All", value: "all" },
            { label: "Active", value: "active" },
            { label: "Pending", value: "pending" },
            { label: "Suspended", value: "suspended" },
          ]}
          selected={statusFilter}
          onChange={(val) => { setStatusFilter(val as CustomerStatus | "all"); setPage(1); }}
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
        onRowClick={(row) => navigate(`/dashboard/customers/${row.id}`)}
        rowKey={(row) => row.id}
        emptyMessage="No customers found matching your criteria."
      />
    </div>
  );
}
