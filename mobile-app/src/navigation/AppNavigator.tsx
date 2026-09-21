import React from 'react';
import { useAuthStore } from '../store/useStore';

import AuthNavigator from './AuthNavigator';
import OnboardingNavigator from './OnboardingNavigator';
import TabNavigator from './TabNavigator';

/**
 * Three states, not two.
 *
 * Previously this flipped straight to the tab bar the moment `isAuthenticated`
 * went true, which unmounted the whole auth stack — so ChangePassword, PinSetup
 * and BiometricSetup existed but were unreachable, and a customer signing in
 * with their one-time password went straight to the home screen and kept it.
 *
 * `onboarding` is server state (public.customers), so it cannot be skipped by
 * reinstalling the app or clearing local storage.
 */
export default function AppNavigator() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const onboarding = useAuthStore((state) => state.onboarding);

  if (!isAuthenticated) return <AuthNavigator />;

  // `found: false` means neither a customer nor a users row backs this login.
  // Nothing to enforce, so do not strand them on an onboarding screen.
  const needsOnboarding = Boolean(onboarding?.found) && !onboarding?.onboardingComplete;

  return needsOnboarding ? <OnboardingNavigator /> : <TabNavigator />;
}
