import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@biopay/shared/features/auth/AuthContext";
import { ProtectedRoute } from "@biopay/shared/components/layout/ProtectedRoute";
import { ROUTES } from "@biopay/shared/lib/constants";


import LoginPage from "@biopay/shared/pages/login/LoginPage";
import DashboardLayout from "@biopay/shared/pages/dashboard/DashboardLayout";
import Overview from "@biopay/shared/pages/dashboard/Overview";
import RegisterCustomerPage from "@biopay/shared/pages/register-customer/RegisterCustomerPage";
import CustomersPage from "@biopay/shared/pages/customers/CustomersPage";
import CustomerDetailsPage from "@biopay/shared/pages/customers/CustomerDetailsPage";
import TransactionsPage from "@biopay/shared/pages/transactions/TransactionsPage";
import TransactionDetailsPage from "@biopay/shared/pages/transactions/TransactionDetailsPage";
import SettingsPage from "@biopay/shared/pages/settings/SettingsPage";
import StaffPage from "@biopay/shared/pages/staff/StaffPage";
import NotFoundPage from "@biopay/shared/pages/not-found/NotFoundPage";

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
            <Route path="register" element={<RegisterCustomerPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="staff" element={<StaffPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}