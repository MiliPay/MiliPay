import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { AuthProvider } from "@milipay/shared/features/auth/AuthContext";
import { ThemeProvider } from "@milipay/shared/lib/theme";
import { ProtectedRoute } from "@milipay/shared/components/layout/ProtectedRoute";
import { ServiceLayout } from "@milipay/shared/components/layout/ServiceLayout";
import LoginPage from "@milipay/shared/pages/login/LoginPage";
import { SupportDashboard } from "@milipay/shared/pages/dashboard/SupportDashboard";
import SupportCustomersPage from "@milipay/shared/pages/customers/SupportCustomersPage";
import SupportCustomerPage from "@milipay/shared/pages/customers/SupportCustomerPage";
import { ComplaintsDesk } from "@milipay/shared/pages/complaints/ComplaintsDesk";
import CallLogPage from "@milipay/shared/pages/complaints/CallLogPage";
import SavedRepliesPage from "@milipay/shared/pages/complaints/SavedRepliesPage";
import SettingsPage from "@milipay/shared/pages/settings/AccountSettingsPage";
import { SUPPORT_ROUTES } from "@milipay/shared/lib/constants";

/** Old links (/dashboard/customers/:id) still land on the customer. */
function CustomerAlias() {
  const { id = "" } = useParams<{ id: string }>();
  return <Navigate to={SUPPORT_ROUTES.customerDetails.replace(":id", id)} replace />;
}

export default function App() {
  return (
    <ThemeProvider portal="support">
    <AuthProvider allowedRoles={["support", "super_admin"]} staffMfa auditTarget="Support portal">
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage portal="support" />} />
          <Route
            element={
              <ProtectedRoute>
                <ServiceLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Navigate to={SUPPORT_ROUTES.dashboard} replace />} />
            <Route path={SUPPORT_ROUTES.dashboard} element={<SupportDashboard />} />
            <Route path={SUPPORT_ROUTES.complaints} element={<ComplaintsDesk />} />
            <Route path={SUPPORT_ROUTES.complaintDetails} element={<ComplaintsDesk />} />
            <Route path={SUPPORT_ROUTES.calls} element={<CallLogPage />} />
            <Route path={SUPPORT_ROUTES.replies} element={<SavedRepliesPage />} />
            <Route path={SUPPORT_ROUTES.customers} element={<SupportCustomersPage />} />
            <Route path={SUPPORT_ROUTES.applicant} element={<SupportCustomerPage applicant />} />
            <Route path={SUPPORT_ROUTES.customerDetails} element={<SupportCustomerPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            {/* "My cases" is the desk's Mine tab now; old links still work. */}
            <Route path="/cases" element={<Navigate to={SUPPORT_ROUTES.complaints} replace />} />
            <Route path="/dashboard/customers" element={<Navigate to={SUPPORT_ROUTES.customers} replace />} />
            <Route path="/dashboard/customers/:id" element={<CustomerAlias />} />
            <Route path="/dashboard/settings" element={<Navigate to="/settings" replace />} />
            <Route path="*" element={<Navigate to={SUPPORT_ROUTES.dashboard} replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </ThemeProvider>
  );
}
