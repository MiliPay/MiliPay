
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@milipay/shared/features/auth/AuthContext";
import { ProtectedRoute } from "@milipay/shared/components/layout/ProtectedRoute";
import { AgentLayout } from "@milipay/shared/components/layout/AgentLayout";
import LoginPage from "@milipay/shared/pages/login/LoginPage";
import { AgentDashboard } from "@milipay/shared/pages/dashboard/AgentDashboard";
import RegisterCustomerPage from "@milipay/shared/pages/register-customer/RegisterCustomerPage";
import CustomersPage from "@milipay/shared/pages/customers/CustomersPage";
import CustomerDetailsPage from "@milipay/shared/pages/customers/CustomerDetailsPage";

export default function App() {
  return (
    <AuthProvider allowedRoles={["agent", "super_admin"]}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
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
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/customers/:id" element={<CustomerDetailsPage />} />
            <Route path="*" element={<div className="p-8">Coming Soon</div>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}