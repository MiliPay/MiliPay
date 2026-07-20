import { useNavigate } from "react-router-dom";
import { Button } from "@biopay/shared/components/ui/Button";
import { Card } from "@biopay/shared/components/ui/Card";
import { ROUTES } from "@biopay/shared/lib/constants";

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-ledger relative overflow-hidden">
      <div className="absolute top-[-160px] left-[-100px] w-[440px] h-[440px] bg-status-warn rounded-full blur-[150px] opacity-[0.05]" />

      <Card raised className="w-full max-w-lg p-10 md:p-12 relative z-10 text-center flex flex-col items-center">
        <h1 className="font-display text-6xl font-bold text-ink-faint mb-2">404</h1>
        <h2 className="text-2xl font-display font-bold text-ink mb-3">Page not found</h2>
        <p className="text-ink-muted mb-9 leading-relaxed">
          The page you're looking for doesn't exist or has been moved.
        </p>

        <Button size="lg" onClick={() => navigate(ROUTES.dashboard)}>
          Back to dashboard
        </Button>
      </Card>
    </div>
  );
}
