import { useNavigate } from "react-router-dom";
import { Activity, ShieldCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FingerprintScanner } from "@/components/ui/FingerprintScanner";
import { ROUTES } from "@/lib/constants";

export default function OnboardingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-ledger relative overflow-hidden">
      <div className="absolute top-[-160px] left-[-100px] w-[440px] h-[440px] bg-signal rounded-full blur-[150px] opacity-[0.07]" />

      <Card raised className="w-full max-w-lg p-10 md:p-12 relative z-10 text-center">
        <div className="flex justify-center mb-8">
          <FingerprintScanner state="idle" onScan={() => {}} size="lg" />
        </div>

        <h1 className="text-2xl font-display font-bold text-ink mb-3">BioPay Console</h1>
        <p className="text-ink-muted mb-9 leading-relaxed">
          Register customers, link bank accounts, and watch biometric payments
          move across the network — from one console.
        </p>

        <div className="flex flex-col gap-2.5 mb-9 text-left">
          <Feature icon={<UserPlus className="w-[18px] h-[18px]" />} text="Register new customers in minutes" />
          <Feature icon={<Activity className="w-[18px] h-[18px]" />} text="Watch transactions land in real time" />
          <Feature icon={<ShieldCheck className="w-[18px] h-[18px]" />} text="Fingerprint and PIN, never one alone" />
        </div>

        <Button size="lg" className="w-full" onClick={() => navigate(ROUTES.login)}>
          Continue to sign in
        </Button>
      </Card>
    </div>
  );
}

function Feature({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3.5 bg-white/[0.02] border border-ledger-line rounded px-4 py-3">
      <span className="text-signal-bright shrink-0">{icon}</span>
      <span className="text-sm text-ink/90 font-medium">{text}</span>
    </div>
  );
}