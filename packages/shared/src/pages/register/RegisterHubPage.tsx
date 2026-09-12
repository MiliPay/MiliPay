import { useNavigate } from "react-router-dom";
import { UserPlus, ShieldPlus, Store } from "lucide-react";
import { useAuth } from "@milipay/shared/features/auth/AuthContext";
import { useState } from "react";
import { CreateStaffModal } from "@milipay/shared/pages/staff/CreateStaffModal";
import { ROUTES } from "@milipay/shared/lib/constants";

export default function RegisterHubPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);

  // If the user isn't an admin, they shouldn't even see the choice. 
  // But just in case they land here, we redirect them to the customer registration directly.
  if (user?.role === "agent") {
    navigate(`${ROUTES.register}/customer`, { replace: true });
    return null;
  }

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto animate-rise-in">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-semibold text-white tracking-tight mb-1">
          Register New Account
        </h1>
        <p className="text-ink-muted">Choose the type of entity or account you want to create.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl">
        {/* Register Customer Card */}
        <button
          onClick={() => navigate(`${ROUTES.register}/customer`)}
          className="flex flex-col items-start p-6 text-left border border-white/[0.05] bg-ledger-line rounded-2xl hover:bg-white/[0.03] hover:border-signal/30 transition-all group focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal"
        >
          <div className="w-12 h-12 flex items-center justify-center bg-signal/10 rounded-xl mb-6 group-hover:scale-110 transition-transform">
            <UserPlus className="w-6 h-6 text-signal-bright" />
          </div>
          <h2 className="text-lg font-bold text-white mb-2">Register Customer</h2>
          <p className="text-xs text-ink-muted leading-relaxed">
            Enroll a new citizen with their palm vein biometric data and linked bank accounts.
          </p>
        </button>

        {/* Register Merchant Card */}
        <button
          onClick={() => navigate(ROUTES.registerMerchant || "/dashboard/register/merchant")}
          className="flex flex-col items-start p-6 text-left border border-white/[0.05] bg-ledger-line rounded-2xl hover:bg-white/[0.03] hover:border-status-ok/30 transition-all group focus-visible:outline focus-visible:outline-2 focus-visible:outline-status-ok"
        >
          <div className="w-12 h-12 flex items-center justify-center bg-status-ok/10 rounded-xl mb-6 group-hover:scale-110 transition-transform">
            <Store className="w-6 h-6 text-status-ok" />
          </div>
          <h2 className="text-lg font-bold text-white mb-2">Register Merchant</h2>
          <p className="text-xs text-ink-muted leading-relaxed">
            Onboard a retail shop, configure Mono DirectPay settlement, and pair POS hardware.
          </p>
        </button>

        {/* Register Staff Card */}
        <button
          onClick={() => setIsStaffModalOpen(true)}
          className="flex flex-col items-start p-6 text-left border border-white/[0.05] bg-ledger-line rounded-2xl hover:bg-white/[0.03] hover:border-status-info/30 transition-all group focus-visible:outline focus-visible:outline-2 focus-visible:outline-status-info"
        >
          <div className="w-12 h-12 flex items-center justify-center bg-status-info/10 rounded-xl mb-6 group-hover:scale-110 transition-transform">
            <ShieldPlus className="w-6 h-6 text-status-info" />
          </div>
          <h2 className="text-lg font-bold text-white mb-2">Register Staff</h2>
          <p className="text-xs text-ink-muted leading-relaxed">
            Create an account for a new Field Agent, Support specialist, or Administrator.
          </p>
        </button>
      </div>


      {/* Staff Modal */}
      <CreateStaffModal
        isOpen={isStaffModalOpen}
        onClose={() => setIsStaffModalOpen(false)}
        onSuccess={() => {
          setIsStaffModalOpen(false);
          // Optional: redirect to staff list page after successful creation
          navigate(ROUTES.staff);
        }}
      />
    </div>
  );
}
