import { useEffect, useState, useCallback } from "react";
import { DataTable } from "@milipay/shared/components/ui/DataTable";
import { SearchInput } from "@milipay/shared/components/ui/SearchInput";
import { FilterChips } from "@milipay/shared/components/ui/FilterChips";
import { Button } from "@milipay/shared/components/ui/Button";
import { fetchStaffList, toggleStaffStatus } from "@milipay/shared/features/staff/api";
import type { StaffProfile, Role } from "@milipay/shared/types";
import { formatDate } from "@milipay/shared/lib/utils/format";
import { Shield, Users, Headset, UserPlus, Ban, CheckCircle } from "lucide-react";
import { CreateStaffModal } from "./CreateStaffModal";

function RoleBadge({ role }: { role: Role }) {
  const styles = {
    agent: "bg-signal/10 text-signal-bright border-signal/20",
    support: "bg-status-info/10 text-status-info border-status-info/20",
    admin: "bg-status-warning/10 text-status-warning border-status-warning/20",
    super_admin: "bg-status-fail/10 text-status-fail border-status-fail/20",
  };

  const icons = {
    agent: <Users className="w-3 h-3 mr-1.5" />,
    support: <Headset className="w-3 h-3 mr-1.5" />,
    admin: <Shield className="w-3 h-3 mr-1.5" />,
    super_admin: <Shield className="w-3 h-3 mr-1.5" />,
  };

  const labels = {
    agent: "Agent",
    support: "Support",
    admin: "Admin",
    super_admin: "Super Admin",
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${styles[role]}`}>
      {icons[role]}
      {labels[role]}
    </span>
  );
}

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "all">("all");
  const [isModalOpen, setIsModalOpen] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await fetchStaffList({ page, pageSize: 10, search, role: roleFilter });
      setStaff(result.items);
      setTotalCount(result.totalCount);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [page, search, roleFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggleStatus = async (staffMember: StaffProfile) => {
    try {
      await toggleStaffStatus(staffMember.id);
      loadData(); // Refresh list to get updated status
    } catch (err) {
      console.error("Failed to update status", err);
    }
  };

  const columns = [
    {
      key: "name",
      header: "Staff Member",
      render: (row: StaffProfile) => (
        <div>
          <div className="font-medium text-ink">{row.fullName}</div>
          <div className="text-xs text-ink-muted">{row.email}</div>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      render: (row: StaffProfile) => <RoleBadge role={row.role} />,
    },
    {
      key: "status",
      header: "Status",
      render: (row: StaffProfile) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
          row.status === 'active' 
            ? 'bg-status-ok/10 text-status-ok' 
            : 'bg-status-fail/10 text-status-fail'
        }`}>
          {row.status === 'active' ? 'Active' : 'Suspended'}
        </span>
      ),
    },
    {
      key: "metrics",
      header: "Performance",
      render: (row: StaffProfile) => (
        row.role === "agent" ? (
          <div className="flex flex-col">
            <span className="font-data text-sm text-ink">{row.registrationsCount}</span>
            <span className="text-[10px] text-ink-muted uppercase">Registrations</span>
          </div>
        ) : (
          <span className="text-ink-faint text-sm">—</span>
        )
      ),
    },
    {
      key: "joined",
      header: "Joined",
      render: (row: StaffProfile) => (
        <span className="text-sm text-ink-muted">{formatDate(row.createdAt)}</span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row: StaffProfile) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleToggleStatus(row);
          }}
          className={`p-1.5 rounded-lg transition-colors ${
            row.status === 'active' 
              ? 'text-status-fail hover:bg-status-fail/10' 
              : 'text-status-ok hover:bg-status-ok/10'
          }`}
          title={row.status === 'active' ? "Suspend User" : "Activate User"}
        >
          {row.status === 'active' ? <Ban className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
        </button>
      ),
    }
  ];

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto animate-rise-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="font-display text-3xl font-semibold text-white tracking-tight mb-1">
            Staff & Team
          </h1>
          <p className="text-ink-muted">Manage agents, support staff, and administrators.</p>
        </div>
        
        <Button onClick={() => setIsModalOpen(true)}>
          <UserPlus className="w-4 h-4 mr-2" />
          Add Staff Member
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="w-full sm:w-72">
          <SearchInput 
            onSearch={(val) => { setSearch(val); setPage(1); }} 
            placeholder="Search name, email, or phone..." 
          />
        </div>
        <FilterChips
          options={[
            { label: "All Staff", value: "all" },
            { label: "Agents", value: "agent" },
            { label: "Support", value: "support" },
            { label: "Admins", value: "admin" },
          ]}
          selected={roleFilter}
          onChange={(val) => { setRoleFilter(val as Role | "all"); setPage(1); }}
        />
      </div>

      <DataTable
        data={staff}
        columns={columns}
        isLoading={isLoading}
        rowKey={(row) => row.id}
        page={page}
        pageSize={10}
        totalCount={totalCount}
        onPageChange={setPage}
        emptyMessage="No staff members found matching your filters."
      />

      <CreateStaffModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSuccess={() => {
          setPage(1);
          loadData();
        }}
      />
    </div>
  );
}
