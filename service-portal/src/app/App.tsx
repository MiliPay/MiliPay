import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@biopay/shared/features/auth/AuthContext";
import { ProtectedRoute } from "@biopay/shared/components/layout/ProtectedRoute";
import { ServiceLayout } from "@biopay/shared/components/layout/ServiceLayout";
import LoginPage from "@biopay/shared/pages/login/LoginPage";
import { SupportDashboard } from "@biopay/shared/pages/dashboard/SupportDashboard";
import CustomersPage from "@biopay/shared/pages/customers/CustomersPage";
import CustomerDetailsPage from "@biopay/shared/pages/customers/CustomerDetailsPage";
import { ComplaintsDesk } from "@biopay/shared/pages/complaints/ComplaintsDesk";

export default function App() {
  return (
    <AuthProvider allowedRoles={["support", "super_admin"]}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route 
            element={
              <ProtectedRoute>
                <ServiceLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<SupportDashboard />} />
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/customers/:id" element={<CustomerDetailsPage />} />
            <Route path="/complaints" element={<ComplaintsDesk />} />
            <Route path="*" element={<div className="p-8">Coming Soon</div>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}