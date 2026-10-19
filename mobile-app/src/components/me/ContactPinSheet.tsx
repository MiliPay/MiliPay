import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { BottomSheet } from '../ds/BottomSheet';
import { Keypad, PinDots } from '../ds/PinPad';
import { CodeChannelPicker, useCodeChannel } from '../CodeChannelPicker';
import { useThemeColors } from '../../theme/useThemeColors';
import type { CodeChannel } from '../../lib/codeChannelView';

/**
 * "Confirm it's you" before a new email or phone number gets its code
 * (agreed 2026-10-20): the customer's PIN, so someone holding an unlocked
 * phone can't move the account to their own number. With a new number it
 * also asks how that number's code should come: SMS, a call or WhatsApp.
 *
 * `onSubmit` sends the request; it answers with an error to show (the PIN
 * is cleared to try again) or null when the code sheet takes over.
 */
export function ContactPinSheet({
  visible,
  phoneChanging,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  phoneChanging: boolean;
  onSubmit: (pin: string, phoneVia: CodeChannel) => Promise<string | null>;
  onClose: () => void;
}) {
  const c = useThemeColors();
  const { offered, channel, pick } = useCodeChannel('prove_phone');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setPin('');
    setError('');
    setBusy(false);
  }, [visible]);

  const onDigit = (d: string) => {
    if (busy || pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    setError('');
    if (next.length < 4) return;
    setTimeout(async () => {
      setBusy(true);
      const problem = await onSubmit(next, channel);
      setBusy(false);
      if (!problem) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setPin('');
      setError(problem);
      setShake((n) => n + 1);
    }, 220);
  };

  return (
    <BottomSheet visible={visible} onClose={() => !busy && onClose()} title="Confirm it's you">
      <View style={{ gap: 18, paddingBottom: 8 }}>
        <Text style={{ color: c.muted, fontSize: 14, lineHeight: 20, fontFamily: 'Inter_400Regular' }}>
          Enter your PIN to change your contact details. Then we'll send a code to the new {phoneChanging ? 'number' : 'email'} to confirm it.
        </Text>
        {phoneChanging && (
          <CodeChannelPicker offered={offered} value={channel} onChange={pick} label="Send the new number's code by" disabled={busy} />
        )}
        <View style={{ alignItems: 'center', gap: 12 }}>
          <PinDots filled={pin.length} error={!!error} shakeKey={shake} />
          <Text style={{ minHeight: 18, color: c.fail, fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' }}>{error}</Text>
        </View>
        <Keypad onDigit={onDigit} onDelete={() => setPin((p) => p.slice(0, -1))} disabled={busy} />
      </View>
    </BottomSheet>
  );
}
