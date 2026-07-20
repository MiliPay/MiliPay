import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, Mail, ShieldCheck, AlertTriangle } from "lucide-react";
import { Input } from "@biopay/shared/components/ui/Input";
import { Button } from "@biopay/shared/components/ui/Button";
import { Card } from "@biopay/shared/components/ui/Card";
import { useAuth } from "@biopay/shared/features/auth/AuthContext";
import { ROUTES } from "@biopay/shared/lib/constants";
import { loginSchema } from "@biopay/shared/features/auth/authSchema";
import { z } from "zod";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Rate limiting state
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutTime, setLockoutTime] = useState<number | null>(null);
  const [lockoutCountdown, setLockoutCountdown] = useState(0);

  // Redirect to dashboard if already logged in
  useEffect(() => {
    if (isAuthenticated) {
      navigate(ROUTES.dashboard, { replace: true });
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (lockoutTime) {
      timer = setInterval(() => {
        const remaining = Math.ceil((lockoutTime - Date.now()) / 1000);
        if (remaining <= 0) {
          setLockoutTime(null);
          setFailedAttempts(0);
          setLockoutCountdown(0);
        } else {
          setLockoutCountdown(remaining);
        }
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [lockoutTime]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (lockoutTime) return;

    setError(null);
    setIsSubmitting(true);

    try {
      // 1. Zod Validation
      const validatedData = loginSchema.parse({ email, password });

      // 2. Auth call
      await login(validatedData.email, validatedData.password);
      
      // Reset attempts on success
      setFailedAttempts(0);
      navigate(ROUTES.dashboard, { replace: true });
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.issues[0].message);
      } else if (err instanceof Error) {
        setError(err.message);
        
        // Basic Client-side Rate Limiting for Failed Auth
        const newAttempts = failedAttempts + 1;
        setFailedAttempts(newAttempts);
        if (newAttempts >= 3) {
          setError("Too many failed attempts. Try again in 30 seconds.");
          setLockoutTime(Date.now() + 30000);
        }
      } else {
        setError("An unexpected error occurred. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
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
          Enter your email and password to securely access the console
        </p>

        {error && (
          <div className="mb-6 flex items-center gap-3 p-3 rounded bg-status-fail/10 border border-status-fail/20 text-status-fail text-sm">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="relative">
            <Mail className="absolute left-4 top-[42px] w-[18px] h-[18px] text-ink-faint pointer-events-none" />
            <Input
              label="Email Address"
              type="email"
              placeholder="admin@biopay.app"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-11"
              disabled={!!lockoutTime || isSubmitting}
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
              disabled={!!lockoutTime || isSubmitting}
            />
          </div>

          <Button 
            type="submit" 
            size="lg" 
            isLoading={isSubmitting} 
            disabled={!!lockoutTime}
            className="w-full mt-2"
          >
            {lockoutTime ? `Locked (${lockoutCountdown}s)` : "Sign in"}
          </Button>
        </form>
      </Card>
    </div>
  );
}