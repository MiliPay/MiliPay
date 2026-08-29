import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@milipay/shared/features/auth/AuthContext";
import { ProtectedRoute } from "@milipay/shared/components/layout/ProtectedRoute";
import { ROUTES } from "@milipay/shared/lib/constants";


import LoginPage from "@milipay/shared/pages/login/LoginPage";
import DashboardLayout from "@milipay/shared/pages/dashboard/DashboardLayout";
import Overview from "@milipay/shared/pages/dashboard/Overview";
import RegisterHubPage from "@milipay/shared/pages/register/RegisterHubPage";
import RegisterCustomerPage from "@milipay/shared/pages/register-customer/RegisterCustomerPage";
import CustomersPage from "@milipay/shared/pages/customers/CustomersPage";
import CustomerDetailsPage from "@milipay/shared/pages/customers/CustomerDetailsPage";
import TransactionsPage from "@milipay/shared/pages/transactions/TransactionsPage";
import TransactionDetailsPage from "@milipay/shared/pages/transactions/TransactionDetailsPage";
import SettingsPage from "@milipay/shared/pages/settings/SettingsPage";
import StaffPage from "@milipay/shared/pages/staff/StaffPage";
import StaffDetailsPage from "@milipay/shared/pages/staff/StaffDetailsPage";
import { AdminSupportPage } from "@milipay/shared/pages/dashboard/AdminSupportPage";
import { TicketDetailsPage } from "@milipay/shared/pages/complaints/TicketDetailsPage";
import NotFoundPage from "@milipay/shared/pages/not-found/NotFoundPage";

export default function App() {
  return (
    <AuthProvider allowedRoles={["super_admin", "admin"]}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/" element={<Navigate to={ROUTES.dashboard} replace />} />

          <Route path={ROUTES.login} element={<LoginPage />} />

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
            <Route path="customers/:id" element={<CustomerDetailsPage />} />
            <Route path="transactions" element={<TransactionsPage />} />
            <Route path="transactions/:id" element={<TransactionDetailsPage />} />
            <Route path="register" element={<RegisterHubPage />} />
            <Route path="register/customer" element={<RegisterCustomerPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="staff" element={<StaffPage />} />
            <Route path="staff/:id" element={<StaffDetailsPage />} />
            <Route path="support" element={<AdminSupportPage />} />
            <Route path="support/:id" element={<TicketDetailsPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}