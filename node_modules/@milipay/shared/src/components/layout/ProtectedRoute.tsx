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
        title="Securing & Terminating Session..."
        description="Revoking active session tokens, purging device caches, and disconnecting from MiliPay Enterprise Network."
      />
    );
  }

  if (isLoading) {
    return (
      <LoadingState
        fullScreen
        title="Securing Session..."
        description="Authenticating your staff credentials and establishing encrypted session clearance."
      />
    );
  }
  
  if (!isAuthenticated) {
    return <Navigate to={ROUTES.login} state={{ from: location }} replace />;
  }
  return <>{children}</>;
}