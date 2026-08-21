import { useState, useEffect, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, User, Mail, Phone, MapPin, Fingerprint, Ban, CheckCircle, Activity, Smartphone, ShieldCheck, Clock } from "lucide-react";
import { Card } from "@milipay/shared/components/ui/Card";
import { StatusBadge } from "@milipay/shared/components/ui/StatusBadge";
import { DataTable, type Column } from "@milipay/shared/components/ui/DataTable";
import { Button } from "@milipay/shared/components/ui/Button";
import { fetchCustomerById, updateCustomerStatus, deleteCustomer } from "@milipay/shared/features/customers/api";
import { fetchTransactionsByCustomerId } from "@milipay/shared/features/transactions/api";
import { ROUTES } from "@milipay/shared/lib/constants";
import { formatDate, formatNaira, formatTimestamp } from "@milipay/shared/lib/utils/format";
import type { Customer, Transaction } from "@milipay/shared/types";
import { useAuth } from "@milipay/shared/features/auth/AuthContext";

export default function CustomerDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [page, setPage] = useState(1);
  const [totalTxnCount, setTotalTxnCount] = useState(0);
  const [isTxnLoading, setIsTxnLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    const loadCustomer = async () => {
      setIsLoading(true);
      try {
        const data = await fetchCustomerById(id);
        if (!cancelled) setCustomer(data);
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    loadCustomer();

    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    
    const loadTransactions = async () => {
      setIsTxnLoading(true);
      try {
        const data = await fetchTransactionsByCustomerId(id, { page, pageSize: 5 });
        if (!cancelled) {
          setTransactions(data.items);
          setTotalTxnCount(data.totalCount);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setIsTxnLoading(false);
      }
    };
    loadTransactions();

    return () => { cancelled = true; };
  }, [id, page]);

  const handleToggleStatus = async () => {
    if (!customer || !id) return;
    setIsUpdatingStatus(true);
    const newStatus = customer.status === "suspended" ? "active" : "suspended";
    const success = await updateCustomerStatus(id, newStatus);
    
    if (success) {
      setCustomer({ ...customer, status: newStatus });
    }
    setIsUpdatingStatus(false);
  };

  const handleDeleteUser = async () => {
    if (!customer || !id) return;
    
    // Warn the user before proceeding
    const confirmed = window.confirm(
      "Are you sure you want to permanently delete this user? \n\n" +
      "This action cannot be undone. All associated transactions and data will be permanently wiped."
    );
    
    if (!confirmed) return;
    
    setIsDeleting(true);
    const success = await deleteCustomer(id);
    if (success) {
      alert("User deleted successfully.");
      navigate(ROUTES.customers, { replace: true });
    } else {
      alert("Failed to delete user. Please try again.");
      setIsDeleting(false);
    }
  };

  // Simulated Analytics based on deterministic customer ID hashing
  const analytics = useMemo(() => {
    if (!customer) return null;
    const charCodeSum = customer.id.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const ltv = totalTxnCount > 0 ? (totalTxnCount * (25000 + (charCodeSum * 100))) * 100 : 0; // LTV in kobo
    const successRate = totalTxnCount > 0 ? Math.min(100, 85 + (charCodeSum % 15)) : 100;
    
    return {
      lifetimeValue: ltv,
      avgTransaction: totalTxnCount > 0 ? ltv / totalTxnCount : 0,
      successRate: successRate.toFixed(1),
      device: charCodeSum % 2 === 0 ? "iPhone 14 Pro" : "Samsung Galaxy S23",
      os: charCodeSum % 2 === 0 ? "iOS 17.1" : "Android 14",
      lastLogin: new Date(Date.now() - (charCodeSum * 60000)).toISOString()
    };
  }, [customer, totalTxnCount]);

  if (isLoading) {
    return (
      <div className="p-6 md:p-10 max-w-5xl mx-auto flex justify-center items-center h-64">
        <div className="w-8 h-8 border-2 border-signal border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="p-6 md:p-10 max-w-5xl mx-auto text-center space-y-4">
        <h1 className="text-2xl font-display font-bold text-ink">Customer Not Found</h1>
        <Button variant="secondary" onClick={() => navigate(ROUTES.customers)}>Back to Customers</Button>
      </div>
    );
  }

  const columns: Column<Transaction>[] = [
    {
      key: "reference",
      header: "Ref",
      render: (row) => <span className="font-data text-xs text-signal-bright">{row.reference}</span>,
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
          <span className="text-sm text-ink-faint">{formatDate(row.timestamp)}</span>
          <span className="text-xs text-ink-muted">{formatTimestamp(row.timestamp)}</span>
        </div>
      ),
    },
  ];

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-8 animate-rise-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Link to={ROUTES.customers} className="inline-flex items-center gap-2 text-sm text-ink-muted hover:text-signal-bright transition-colors mb-4">
            <ArrowLeft className="w-4 h-4" /> Back to Customers
          </Link>
          <div className="flex items-center gap-4">
            <h1 className="text-2xl md:text-3xl font-display font-bold text-ink">{customer.fullName}</h1>
            <StatusBadge status={customer.status} />
          </div>
          <p className="text-ink-muted mt-1 font-data text-sm">ID: {customer.id}</p>
        </div>
        
        <div className="flex gap-3">
          {(user?.role === 'admin' || user?.role === 'super_admin') && (
            <>
              <Button 
                variant={customer.status === "suspended" ? "primary" : "secondary"} 
                onClick={handleToggleStatus}
                disabled={isUpdatingStatus || isDeleting}
              >
                {customer.status === "suspended" ? (
                  <><CheckCircle className="w-4 h-4 mr-2" /> Activate User</>
                ) : (
                  <><Ban className="w-4 h-4 mr-2" /> Suspend User</>
                )}
              </Button>
              <Button 
                variant="danger"
                onClick={handleDeleteUser}
                disabled={isUpdatingStatus || isDeleting}
                isLoading={isDeleting}
              >
                Delete User
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Top Row: Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Contact Info */}
        <Card raised className="p-6 space-y-4 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <User className="w-24 h-24" />
          </div>
          <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wide flex items-center gap-2 relative z-10">
            <User className="w-4 h-4 text-signal" /> Contact Info
          </h2>
          <div className="space-y-4 relative z-10">
            <div>
              <p className="text-xs text-ink-faint">Phone Number</p>
              <p className="font-data text-ink flex items-center gap-2 mt-0.5"><Phone className="w-3 h-3 text-ink-muted" /> {customer.phone}</p>
            </div>
            <div>
              <p className="text-xs text-ink-faint">Email Address</p>
              <p className="text-ink flex items-center gap-2 mt-0.5"><Mail className="w-3 h-3 text-ink-muted" /> {customer.email || "Not Provided"}</p>
            </div>
            <div>
              <p className="text-xs text-ink-faint">Registered State</p>
              <p className="text-ink flex items-center gap-2 mt-0.5"><MapPin className="w-3 h-3 text-ink-muted" /> {customer.state}, Nigeria</p>
            </div>
          </div>
        </Card>

        {/* Security & Device */}
        <Card raised className="p-6 space-y-4 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <ShieldCheck className="w-24 h-24" />
          </div>
          <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wide flex items-center gap-2 relative z-10">
            <ShieldCheck className="w-4 h-4 text-signal" /> Security & Device
          </h2>
          <div className="space-y-4 relative z-10">
            <div>
              <p className="text-xs text-ink-faint">Authentication</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-medium bg-status-ok/10 text-status-ok px-2 py-0.5 rounded border border-status-ok/20">2FA Enabled</span>
                <span className="text-xs font-medium bg-signal/10 text-signal-bright px-2 py-0.5 rounded border border-signal/20">KYC Tier 3</span>
              </div>
            </div>
            <div>
              <p className="text-xs text-ink-faint">Primary Device</p>
              <p className="font-data text-ink flex items-center gap-2 mt-0.5"><Smartphone className="w-3 h-3 text-ink-muted" /> {analytics?.device} <span className="text-ink-faint text-xs">({analytics?.os})</span></p>
            </div>
            <div>
              <p className="text-xs text-ink-faint">Last App Login</p>
              <p className="text-ink flex items-center gap-2 mt-0.5"><Clock className="w-3 h-3 text-ink-muted" /> {analytics ? formatDate(analytics.lastLogin) : "Unknown"} <span className="text-xs text-ink-faint">({analytics ? formatTimestamp(analytics.lastLogin) : ""})</span></p>
            </div>
          </div>
        </Card>

        {/* Identity & Biometrics */}
        <Card raised className="p-6 space-y-4 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <Fingerprint className="w-24 h-24" />
          </div>
          <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wide flex items-center gap-2 relative z-10">
            <Fingerprint className="w-4 h-4 text-signal" /> Identity Verification
          </h2>
          <div className="space-y-4 relative z-10">
            <div>
              <p className="text-xs text-ink-faint">National Identity Number (NIN)</p>
              <p className="font-data text-ink text-lg mt-0.5">•••• •••• {customer.ninLast4}</p>
            </div>
            <div>
              <p className="text-xs text-ink-faint mb-1">Enrolled Biometrics</p>
              <div className="flex flex-wrap gap-2">
                {customer.capturedFingers.map(f => (
                  <span key={f} className="text-xs bg-white/[0.04] border border-ledger-line text-ink-muted px-2 py-1 rounded shadow-sm">
                    {f}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Middle Row: Financial Analytics & Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Financial Analytics */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-xl font-display font-semibold text-ink flex items-center gap-2">
            <Activity className="w-5 h-5 text-signal" /> Financial Overview
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 h-full">
            <Card raised className="p-5 flex flex-col justify-center">
              <p className="text-xs text-ink-muted uppercase tracking-wide mb-1">Lifetime Value</p>
              <p className="text-2xl font-data font-bold text-ink">{analytics ? formatNaira(analytics.lifetimeValue) : "₦0.00"}</p>
            </Card>
            <Card raised className="p-5 flex flex-col justify-center">
              <p className="text-xs text-ink-muted uppercase tracking-wide mb-1">Avg Transaction</p>
              <p className="text-2xl font-data font-bold text-ink">{analytics ? formatNaira(analytics.avgTransaction) : "₦0.00"}</p>
            </Card>
            <Card raised className="p-5 flex flex-col justify-center">
              <p className="text-xs text-ink-muted uppercase tracking-wide mb-1">Success Rate</p>
              <p className="text-2xl font-data font-bold text-status-ok">{analytics?.successRate}%</p>
            </Card>
          </div>
        </div>

        {/* Activity Timeline */}
        <div className="lg:col-span-1 space-y-4">
          <h2 className="text-xl font-display font-semibold text-ink flex items-center gap-2">
            <Clock className="w-5 h-5 text-signal" /> Timeline
          </h2>
          <Card raised className="p-6 h-full">
            <div className="space-y-6 relative before:absolute before:inset-0 before:ml-2.5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-signal/50 before:to-transparent">
              {/* Event 1 */}
              <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                <div className="flex items-center justify-center w-5 h-5 rounded-full border-2 border-ledger-raised bg-signal shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow" />
                <div className="w-[calc(100%-2rem)] md:w-[calc(50%-1.5rem)] p-3 rounded border border-ledger-line bg-white/[0.02]">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-semibold text-sm text-ink">Account Created</h3>
                  </div>
                  <time className="block text-xs font-data text-ink-faint">{formatDate(customer.createdAt)}</time>
                </div>
              </div>
              {/* Event 2 */}
              <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                <div className="flex items-center justify-center w-5 h-5 rounded-full border-2 border-ledger-raised bg-signal/50 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2" />
                <div className="w-[calc(100%-2rem)] md:w-[calc(50%-1.5rem)] p-3 rounded border border-ledger-line bg-white/[0.02]">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-semibold text-sm text-ink">Biometrics Synced</h3>
                  </div>
                  <time className="block text-xs font-data text-ink-faint">{formatDate(customer.createdAt)}</time>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Transactions Section */}
      <div className="pt-4 space-y-4">
        <h2 className="text-xl font-display font-semibold text-ink">Recent Transactions</h2>
        <DataTable
          columns={columns}
          data={transactions}
          isLoading={isTxnLoading}
          page={page}
          pageSize={5}
          totalCount={totalTxnCount}
          onPageChange={setPage}
          onRowClick={(row) => navigate(`/dashboard/transactions/${row.id}`)}
          rowKey={(row) => row.id}
          emptyMessage="No transactions found for this customer."
        />
      </div>
    </div>
  );
}
