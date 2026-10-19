import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@milipay/shared/features/auth/AuthContext";
import { ProtectedRoute } from "@milipay/shared/components/layout/ProtectedRoute";
import LoginPage from "@milipay/shared/pages/login/MerchantLoginPage";
import { MerchantLayout } from "@/components/MerchantLayout";
import { MerchantSecondStep } from "@/components/MerchantSecondStep";
import MerchantDashboardPage from "@/pages/MerchantDashboardPage";
import MerchantTransactionsPage from "@/pages/MerchantTransactionsPage";
import MerchantTerminalsPage from "@/pages/MerchantTerminalsPage";
import MerchantSettingsPage from "@/pages/MerchantSettingsPage";

export default function App() {
  return (
    <AuthProvider allowedRoles={["merchant", "super_admin"]}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage portal="merchant" />} />
          <Route
            element={
              <ProtectedRoute>
                {/* The code after the password; the database enforces it too. */}
                <MerchantSecondStep>
                  <MerchantLayout />
                </MerchantSecondStep>
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<MerchantDashboardPage />} />
            <Route path="/transactions" element={<MerchantTransactionsPage />} />
            <Route path="/terminals" element={<MerchantTerminalsPage />} />
            <Route path="/settings" element={<MerchantSettingsPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
