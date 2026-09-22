import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@milipay/shared/features/auth/AuthContext";
import { ROUTES } from "@milipay/shared/lib/constants";
import { LoadingState } from "@milipay/shared/components/ui/LoadingState";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, isLoggingOut } = useAuth();
  const location = useLocation();
  
  if (isLoggingOut) {
    return (
      <LoadingState
        fullScreen
        title="Signing out"
        description="Ending your session."
      />
    );
  }

  if (isLoading) {
    return (
      <LoadingState
        fullScreen
        title="Signing in"
        description="Checking your account."
      />
    );
  }
  
  if (!isAuthenticated) {
    return <Navigate to={ROUTES.login} state={{ from: location }} replace />;
  }
  return <>{children}</>;
}