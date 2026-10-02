import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@milipay/shared/features/auth/AuthContext";
import { ThemeProvider } from "@milipay/shared/lib/theme";
import { ProtectedRoute } from "@milipay/shared/components/layout/ProtectedRoute";
import { ROUTES } from "@milipay/shared/lib/constants";


import LoginPage from "@milipay/shared/pages/login/LoginPage";
import DashboardLayout from "@milipay/shared/pages/dashboard/DashboardLayout";
import Overview from "@milipay/shared/pages/dashboard/Overview";
import RegisterHubPage from "@milipay/shared/pages/register/RegisterHubPage";
import RegisterCustomerPage from "@milipay/shared/pages/register-customer/RegisterCustomerPage";
import CustomersPage from "@milipay/shared/pages/customers/CustomersPage";
import CustomerDetailsPage from "@milipay/shared/pages/customers/CustomerDetailsPage";
import SignupReviewsPage from "@milipay/shared/pages/customers/SignupReviewsPage";
import TransactionsPage from "@milipay/shared/pages/transactions/TransactionsPage";
import SettingsPage from "@milipay/shared/pages/settings/SettingsPage";
import StaffPage from "@milipay/shared/pages/staff/StaffPage";
import StaffDetailsPage from "@milipay/shared/pages/staff/StaffDetailsPage";
import MerchantsPage from "@milipay/shared/pages/merchants/MerchantsPage";
import MerchantDetailsPage from "@milipay/shared/pages/merchants/MerchantDetailsPage";
import TerminalsPage from "@milipay/shared/pages/merchants/TerminalsPage";
import RegisterMerchantPage from "@milipay/shared/pages/merchants/RegisterMerchantPage";
import { AdminSupportPage } from "@milipay/shared/pages/dashboard/AdminSupportPage";
import { OperationsPage } from "@milipay/shared/pages/operations/OperationsPage";
import { TicketDetailsPage } from "@milipay/shared/pages/complaints/TicketDetailsPage";
import NotFoundPage from "@milipay/shared/pages/not-found/NotFoundPage";
import AuditLogPage from "@milipay/shared/pages/audit/AuditLogPage";


export default function App() {
  return (
    <ThemeProvider portal="admin">
    <AuthProvider allowedRoles={["super_admin", "admin"]} staffMfa auditTarget="Admin console">
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/" element={<Navigate to={ROUTES.dashboard} replace />} />

          <Route path={ROUTES.login} element={<LoginPage portal="admin" />} />

          <Route
            path={ROUTES.dashboard}
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Overview />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="customers/signup-reviews" element={<SignupReviewsPage />} />
            <Route path="customers/:id" element={<CustomerDetailsPage />} />
            <Route path="merchants" element={<MerchantsPage />} />
            <Route path="merchants/:id" element={<MerchantDetailsPage />} />
            <Route path="terminals" element={<TerminalsPage />} />
            <Route path="transactions" element={<TransactionsPage />} />
            <Route path="transactions/:id" element={<TransactionsPage />} />
            <Route path="register" element={<RegisterHubPage />} />
            <Route path="register/customer" element={<RegisterCustomerPage />} />
            <Route path="register/merchant" element={<RegisterMerchantPage />} />
            <Route path="settings" element={<SettingsPage />} />

            <Route path="staff" element={<StaffPage />} />
            <Route path="staff/:id" element={<StaffDetailsPage />} />
            <Route path="operations" element={<OperationsPage />} />
            <Route path="audit" element={<AuditLogPage />} />
            <Route path="support" element={<AdminSupportPage />} />
            <Route path="support/:id" element={<TicketDetailsPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </ThemeProvider>
  );
}