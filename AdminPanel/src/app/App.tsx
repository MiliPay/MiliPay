import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/features/auth/AuthContext";
import { ProtectedRoute } from "@/app/ProtectedRoute";
import { ROUTES } from "@/lib/constants";

import OnboardingPage from "@/pages/onboarding/OnboardingPage";
import LoginPage from "@/pages/login/LoginPage";
import DashboardLayout from "@/pages/dashboard/DashboardLayout";
import Overview from "@/pages/dashboard/Overview";
import RegisterCustomerPage from "@/pages/register-customer/RegisterCustomerPage";
import SettingsPage from "@/pages/settings/SettingsPage";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to={ROUTES.dashboard} replace />} />
          <Route path={ROUTES.onboarding} element={<OnboardingPage />} />
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
            <Route path="register" element={<RegisterCustomerPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}