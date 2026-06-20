import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, Phone, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuth, resolveMockRole } from "@/features/auth/AuthContext";
import { ROUTES } from "@/lib/constants";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    // Production: call Firebase Function with phone + password,
    // verify bcrypt hash server-side, receive a custom auth token.
    await new Promise((r) => setTimeout(r, 500));
    login({
      id: "staff_1",
      fullName: "Agent",
      phone,
      role: resolveMockRole(phone),
    });
    setIsSubmitting(false);
    navigate(ROUTES.dashboard);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-ledger relative overflow-hidden">
      <div className="absolute top-[-180px] right-[-100px] w-[480px] h-[480px] bg-signal rounded-full blur-[160px] opacity-[0.08]" />

      <Card raised className="w-full max-w-md p-10 relative z-10">
        <div className="flex justify-center mb-7">
          <div className="w-12 h-12 rounded-lg bg-signal/10 border border-signal/30 flex items-center justify-center">
            <ShieldCheck className="text-signal-bright w-6 h-6" />
          </div>
        </div>

        <h1 className="text-xl font-display font-bold text-center text-ink mb-1.5">Sign in</h1>
        <p className="text-center text-ink-muted text-sm mb-8">
          Use the phone number and password on your agent account
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="relative">
            <Phone className="absolute left-4 top-[42px] w-[18px] h-[18px] text-ink-faint pointer-events-none" />
            <Input
              label="Phone number"
              mono
              placeholder="08012345678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="pl-11"
            />
          </div>
          <div className="relative">
            <KeyRound className="absolute left-4 top-[42px] w-[18px] h-[18px] text-ink-faint pointer-events-none" />
            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-11"
            />
          </div>

          <Button type="submit" size="lg" isLoading={isSubmitting} className="w-full mt-2">
            Sign in
          </Button>
        </form>
      </Card>
    </div>
  );
}