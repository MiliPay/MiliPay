import React from 'react';
import { useAuthStore } from '../store/useStore';
import { useAppLock } from '../lib/appLock';

import AuthNavigator from './AuthNavigator';
import OnboardingNavigator from './OnboardingNavigator';
import TabNavigator from './TabNavigator';
import UnlockScreen from '../screens/auth/UnlockScreen';
import FingerprintSetupScreen from '../screens/auth/FingerprintSetupScreen';

/**
 * Which part of the app shows, in order:
 *
 *   signed out                       Welcome → log in by code
 *   locked (fingerprint unlock on)   Unlock — nothing else is mounted
 *   setup not finished               password → PIN → fingerprint → all set
 *   new phone, fingerprint not asked the fingerprint offer, once
 *   otherwise                        the tabs
 *
 * `onboarding` is server state (public.customers), so setup cannot be skipped
 * by reinstalling the app or clearing local storage.
 */
export default function AppNavigator() {
  useAppLock();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const locked = useAuthStore((state) => state.locked);
  const onboarding = useAuthStore((state) => state.onboarding);
  const offerFingerprint = useAuthStore((state) => state.offerFingerprint);

  if (!isAuthenticated) return <AuthNavigator />;
  if (locked) return <UnlockScreen />;

  // `found: false` means neither a customer nor a users row backs this login.
  // Nothing to enforce, so do not strand them on an onboarding screen.
  const needsOnboarding = Boolean(onboarding?.found) && !onboarding?.onboardingComplete;
  if (needsOnboarding) return <OnboardingNavigator />;
  if (offerFingerprint) return <FingerprintSetupScreen mode="offer" />;

  return <TabNavigator />;
}
