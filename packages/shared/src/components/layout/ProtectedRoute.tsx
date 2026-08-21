import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@milipay/shared/features/auth/AuthContext";
import { ROUTES } from "@milipay/shared/lib/constants";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) {
    return <div className="h-screen flex items-center justify-center bg-ledger text-ink">Loading session...</div>;
  }
  
  if (!isAuthenticated) {
    return <Navigate to={ROUTES.login} replace />;
  }
  return <>{children}</>;
}