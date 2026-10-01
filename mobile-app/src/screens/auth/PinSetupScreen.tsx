import React, { useState } from 'react';
import { Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { Enter, HeartbeatLoader, Keypad, PinDots } from '../../components/ds';
import { OnbFrame, OnbHeader, OnbTitle } from '../../components/onboarding/OnbParts';
import { useThemeColors } from '../../theme/useThemeColors';
import { useAuthStore } from '../../store/useStore';
import { PIN_MISMATCH, pinCopy } from '../../lib/onboardingView';

/**
 * "Set your 4-digit PIN" (design handoff, screen 3, step 3): enter it, enter
 * it again; a mismatch shakes and starts over. Saved on the server (hashed)
 * before moving on — until then the customer has no PIN, and payments above
 * their threshold would be refused.
 */
export default function PinSetupScreen({ navigation }: any) {
  const c = useThemeColors();
  const setPinOnServer = useAuthStore((s) => s.setPin);

  const [pin, setPin] = useState('');
  const [first, setFirst] = useState('');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(0);
  const [busy, setBusy] = useState(false);

  const copy = pinCopy(!!first);

  const reject = (message: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    setShake((n) => n + 1);
    setTimeout(() => {
      setPin('');
      setFirst('');
      setError(message);
    }, 350);
  };

  const onDigit = (d: string) => {
    if (busy || pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    setError('');
    if (next.length < 4) return;

    if (!first) {
      setTimeout(() => {
        setFirst(next);
        setPin('');
      }, 220);
      return;
    }
    if (next !== first) return reject(PIN_MISMATCH);

    setTimeout(async () => {
      setBusy(true);
      const result = await setPinOnServer(next);
      setBusy(false);
      if (!result.success) return reject(result.error || "Couldn't save your PIN. Please try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      navigation.navigate('FingerprintSetup');
    }, 250);
  };

  return (
    <OnbFrame>
      <OnbHeader step={2} />
      <Enter kind="screenIn" style={{ flex: 1, marginTop: 22 }}>
        <OnbTitle title={copy.title} sub={copy.sub} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
          <PinDots filled={pin.length} shakeKey={shake} />
          <Text accessibilityLiveRegion="polite" style={{ minHeight: 18, color: c.fail, fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' }}>
            {error}
          </Text>
        </View>
        <Keypad onDigit={onDigit} onDelete={() => setPin((p) => p.slice(0, -1))} disabled={busy} />
      </Enter>
      <HeartbeatLoader visible={busy} />
    </OnbFrame>
  );
}
