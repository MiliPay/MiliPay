import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@milipay/shared/features/auth/AuthContext";
import { ThemeProvider } from "@milipay/shared/lib/theme";
import { ProtectedRoute } from "@milipay/shared/components/layout/ProtectedRoute";
import { AgentLayout } from "@milipay/shared/components/layout/AgentLayout";
import LoginPage from "@milipay/shared/pages/login/LoginPage";
import { AgentDashboard } from "@milipay/shared/pages/dashboard/AgentDashboard";
import RegisterCustomerPage from "@milipay/shared/pages/register-customer/RegisterCustomerPage";
import RegisterMerchantPage from "@milipay/shared/pages/merchants/RegisterMerchantPage";
import MerchantsPage from "@milipay/shared/pages/merchants/MerchantsPage";
import MerchantDetailsPage from "@milipay/shared/pages/merchants/MerchantDetailsPage";
import CustomersPage from "@milipay/shared/pages/customers/CustomersPage";
import CustomerDetailsPage from "@milipay/shared/pages/customers/CustomerDetailsPage";
import { AgentSupportPage } from "@milipay/shared/pages/dashboard/AgentSupportPage";
import { AgentTicketDetailsPage } from "@milipay/shared/pages/dashboard/AgentTicketDetailsPage";
import SettingsPage from "@milipay/shared/pages/settings/SettingsPage";

export default function App() {
  return (
    <ThemeProvider portal="agent" defaultTheme="dark">
    <AuthProvider allowedRoles={["agent", "super_admin"]} staffMfa auditTarget="Agent portal">
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage portal="agent" />} />
          <Route 
            element={
              <ProtectedRoute>
                <AgentLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<AgentDashboard />} />
            <Route path="/register" element={<RegisterCustomerPage />} />
            <Route path="/merchants/register" element={<RegisterMerchantPage />} />
            <Route path="/merchants" element={<MerchantsPage />} />
            <Route path="/merchants/:id" element={<MerchantDetailsPage />} />
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/customers/:id" element={<CustomerDetailsPage />} />
            <Route path="/support" element={<AgentSupportPage />} />
            <Route path="/support/:id" element={<AgentTicketDetailsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            {/* Compatibility Aliases for shared /dashboard prefixes */}
            <Route path="/dashboard/merchants" element={<MerchantsPage />} />
            <Route path="/dashboard/merchants/:id" element={<MerchantDetailsPage />} />
            <Route path="/dashboard/register/merchant" element={<RegisterMerchantPage />} />
            <Route path="/dashboard/customers" element={<CustomersPage />} />
            <Route path="/dashboard/customers/:id" element={<CustomerDetailsPage />} />
            <Route path="/dashboard/register" element={<RegisterCustomerPage />} />
            <Route path="/dashboard/settings" element={<SettingsPage />} />

            <Route path="*" element={<div className="p-8">Coming Soon</div>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </ThemeProvider>
  );
}