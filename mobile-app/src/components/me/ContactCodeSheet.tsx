import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Tap } from '../ds/Tap';
import { Mail, Phone, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { BottomSheet } from '../ds/BottomSheet';
import { CodeBoxes } from '../ds/CodeBoxes';
import { PressScale } from '../ds/PressScale';
import { useThemeColors } from '../../theme/useThemeColors';
import { brandFixed } from '../../theme/tokens';
import {
  resendContactCode,
  verifyContactCode,
  type ContactStep,
} from '../../lib/contactChange';
import type { CodeChannel } from '../../lib/codeChannelView';

/**
 * "Confirm your new email / number" (design handoff, screen 10): six boxes
 * for the code sent to the NEW address, "Resend code", "Verify and save". With
 * both changed it asks for them in turn — "Code 1 of 2". The server saves the
 * change only when the last code is right; closing the sheet discards it.
 */
export function ContactCodeSheet({
  requestId,
  steps,
  phoneVia = 'sms',
  onDone,
  onClose,
  onRestart,
}: {
  /** Null hides the sheet. */
  requestId: string | null;
  steps: ContactStep[];
  /** How the new number's code comes (picked with the PIN); a resend uses it too. */
  phoneVia?: CodeChannel;
  /** Every code was right and the server saved the change. */
  onDone: (saved: { email: string | null; phone: string | null }) => void;
  /** Closed without finishing: nothing is saved. */
  onClose: () => void;
  /** The request can no longer continue (expired, too many tries). */
  onRestart: (message: string) => void;
}) {
  const c = useThemeColors();
  const [index, setIndex] = useState(0);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(0);
  const [resent, setResent] = useState(false);
  const [busy, setBusy] = useState(false);

  // Each new request starts at its first code.
  useEffect(() => {
    setIndex(0);
    setCode('');
    setError('');
    setResent(false);
  }, [requestId]);

  const step = steps[Math.min(index, steps.length - 1)];
  const last = index >= steps.length - 1;
  const isEmail = step?.channel === 'email';
  const Icon = isEmail ? Mail : Phone;

  const verify = async () => {
    if (!requestId || !step || code.length !== 6 || busy) return;
    setBusy(true);
    const result = await verifyContactCode(requestId, step.channel, code);
    setBusy(false);
    if (result.ok && result.done) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onDone({ email: result.email, phone: result.phone });
      return;
    }
    if (result.ok) {
      setIndex((i) => i + 1);
      setCode('');
      setError('');
      setResent(false);
      return;
    }
    if (result.closed) {
      onRestart(result.message);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    setError(result.message);
    setShake((n) => n + 1);
  };

  const resend = async () => {
    if (!requestId || !step || resent) return;
    const result = await resendContactCode(requestId, step.channel, phoneVia);
    if (result.ok) {
      setResent(true);
      setCode('');
      setError('');
    } else {
      setError(result.message);
    }
  };

  return (
    <BottomSheet visible={!!requestId && !!step} onClose={onClose} dismissible={!busy}>
      {step ? (
        <View>
          <View style={{ alignItems: 'center', gap: 6 }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: c.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Icon color={c.brandText} size={28} />
            </View>
            {steps.length > 1 ? (
              <Text style={{ marginTop: 6, color: c.muted, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>
                Code {index + 1} of {steps.length}
              </Text>
            ) : null}
            <Text accessibilityRole="header" style={{ marginTop: 6, color: c.text, fontSize: 20, fontFamily: 'Inter_800ExtraBold', letterSpacing: -0.4 }}>
              {isEmail ? 'Confirm your new email' : 'Confirm your new number'}
            </Text>
            <Text style={{ paddingHorizontal: 12, color: c.muted, fontSize: 14, lineHeight: 20, fontFamily: 'Inter_400Regular', textAlign: 'center' }}>
              We sent a 6-digit code to <Text style={{ color: c.text, fontFamily: 'Inter_700Bold' }}>{step.to}</Text>. Enter it to confirm this is yours.
            </Text>
          </View>

          <View style={{ marginTop: 20 }}>
            <CodeBoxes
              key={`${requestId}-${index}`}
              value={code}
              onChange={(v) => {
                setCode(v);
                setError('');
              }}
              error={!!error}
              shakeKey={shake}
              tone="input"
            />
          </View>
          <Text accessibilityLiveRegion="assertive" style={{ minHeight: 18, marginTop: 10, color: c.fail, fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' }}>
            {error}
          </Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
            <Text style={{ color: c.muted, fontSize: 13, fontFamily: 'Inter_400Regular' }}>Didn't get it?</Text>
            <Pressable onPress={() => void resend()} disabled={resent} hitSlop={8} accessibilityRole="button">
              <Text style={{ color: c.brandText, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>{resent ? 'Code sent again' : 'Resend code'}</Text>
            </Pressable>
          </View>

          <PressScale
            onPress={() => void verify()}
            disabled={code.length !== 6 || busy}
            accessibilityRole="button"
            accessibilityState={{ disabled: code.length !== 6 || busy }}
            style={{
              marginTop: 18,
              height: 56,
              borderRadius: 16,
              backgroundColor: c.brand,
              opacity: code.length === 6 && !busy ? 1 : 0.4,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: brandFixed.onBrand, fontSize: 16, fontFamily: 'Inter_700Bold' }}>
              {busy ? 'Checking…' : last ? 'Verify and save' : 'Verify and continue'}
            </Text>
          </PressScale>

          <Tap
            onPress={onClose}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={6}
            style={({ pressed }) => ({
              position: 'absolute',
              top: 0,
              right: 0,
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: pressed ? c.line : c.chip,
              alignItems: 'center',
              justifyContent: 'center',
            })}
          >
            <X color={c.muted} size={16} />
          </Tap>
        </View>
      ) : null}
    </BottomSheet>
  );
}
