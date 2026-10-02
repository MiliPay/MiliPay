import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Check, Fingerprint } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { Button, Enter, PulseRing } from '../../components/ds';
import { Tap } from '../../components/ds/Tap';
import { OnbFrame, OnbHeader, TextButton } from '../../components/onboarding/OnbParts';
import { useThemeColors } from '../../theme/useThemeColors';
import { useAuthStore } from '../../store/useStore';
import { enrolBiometricUnlock, getBiometricCapability } from '../../lib/deviceAuth';

/**
 * "Unlock with your fingerprint" (design handoff, screen 3, step 4).
 *
 * Two uses: the last setup step on a first sign-in (then "You're all set"),
 * and a one-time offer after signing in on a new phone (then Home). "Turn on
 * fingerprint" runs the phone's own prompt and only counts if it succeeds; a
 * phone with no fingerprint set up skips this step, since there is nothing to
 * turn on.
 */
export default function FingerprintSetupScreen({ navigation, mode = 'onboarding' }: { navigation?: any; mode?: 'onboarding' | 'offer' }) {
  const c = useThemeColors();
  const setBiometricEnrolled = useAuthStore((s) => s.setBiometricEnrolled);
  const finishFingerprintOffer = useAuthStore((s) => s.finishFingerprintOffer);
  const signup = useAuthStore((s) => s.onboarding?.signupSource === 'self');

  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const next = (enabled: boolean) => {
    finishFingerprintOffer();
    if (mode === 'onboarding') navigation?.replace('AllSet', { fingerprint: enabled });
  };

  useEffect(() => {
    let live = true;
    getBiometricCapability().then((cap) => {
      if (live && (!cap.hasHardware || !cap.isEnrolled)) next(false);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const turnOn = async () => {
    if (on || busy) return;
    setBusy(true);
    setError('');
    const enrolled = await enrolBiometricUnlock('Turn on fingerprint unlock for MiliPay');
    setBusy(false);
    if (!enrolled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setError("That didn't work. Try again, or choose Not now and use your PIN.");
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setOn(true);
    void setBiometricEnrolled(true);
    setTimeout(() => next(true), 900);
  };

  return (
    <OnbFrame>
      {mode === 'onboarding' ? <OnbHeader step={3} signup={signup} /> : <View style={{ height: 48 }} />}
      <Enter kind="screenIn" style={{ flex: 1, marginTop: 22 }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <Tap
            onPress={turnOn}
            accessibilityRole="button"
            accessibilityLabel="Turn on fingerprint"
            style={{
              width: 132,
              height: 132,
              borderRadius: 66,
              marginBottom: 18,
              backgroundColor: c.brandSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <PulseRing colour={c.brand} />
            {on ? (
              <Enter kind="pop" duration={400}>
                <Check color={c.brand} size={60} strokeWidth={2.5} />
              </Enter>
            ) : (
              <Fingerprint color={c.brand} size={64} strokeWidth={1.5} />
            )}
          </Tap>
          <Text accessibilityRole="header" style={{ color: c.text, fontSize: 28, fontFamily: 'Inter_800ExtraBold', letterSpacing: -0.7, textAlign: 'center' }}>
            {on ? 'Fingerprint is on' : 'Unlock with your fingerprint'}
          </Text>
          <Text style={{ maxWidth: 300, color: c.muted, fontSize: 15, lineHeight: 22.5, fontFamily: 'Inter_400Regular', textAlign: 'center' }}>
            Open MiliPay and approve payments with a touch. You can still use your PIN any time.
          </Text>
          {error ? (
            <Text accessibilityLiveRegion="polite" style={{ maxWidth: 300, color: c.fail, fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' }}>
              {error}
            </Text>
          ) : null}
        </View>
        <View style={{ gap: 10 }}>
          <Button label="Turn on fingerprint" icon={Fingerprint} onPress={turnOn} disabled={busy} />
          <TextButton label="Not now" tone="muted" padding={10} onPress={() => next(false)} />
        </View>
      </Enter>
    </OnbFrame>
  );
}
