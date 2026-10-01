import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useAuthStore } from '../store/useStore';
import { isBiometricUnlockEnabled } from './deviceAuth';
import { shouldLock } from './onboardingView';

/**
 * Lock the app again when it comes back after LOCK_AFTER_MS in the
 * background, for a signed-in customer with fingerprint unlock on. (A cold
 * start locks in the store's initialize.) Short trips away — Mono's bank page,
 * a glance at an SMS for a code — do not lock.
 */
export function useAppLock() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setLocked = useAuthStore((s) => s.setLocked);
  const leftAt = useRef<number | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background') {
        leftAt.current = Date.now();
        return;
      }
      if (next !== 'active') return;
      const since = leftAt.current;
      leftAt.current = null;
      void isBiometricUnlockEnabled().then((on) => {
        if (shouldLock(since, Date.now(), on)) setLocked(true);
      });
    });
    return () => sub.remove();
  }, [isAuthenticated, setLocked]);
}
