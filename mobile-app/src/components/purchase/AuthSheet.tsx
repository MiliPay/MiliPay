import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { Fingerprint, Lock, ScanFace } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Toggle } from '../ds/Form';
import { Keypad, PinDots } from '../ds/PinPad';
import { useThemeColors } from '../../theme/useThemeColors';
import { useAuthStore } from '../../store/useStore';
import {
  getBiometricCapability,
  isBiometricUnlockEnabled,
  promptBiometric,
  type BiometricCapability,
} from '../../lib/deviceAuth';
import { naira0 } from '../../lib/purchaseForm';

type Method = 'biometric' | 'pin';

/**
 * "Confirm it's you" — the approval before any money moves.
 *
 * Fingerprint (or Face ID) by default when the customer has turned it on;
 * the MiliPay PIN otherwise, or whenever they switch to it. Above their PIN
 * threshold only the PIN is offered: the server verifies that PIN itself, and
 * a fingerprint is checked by the phone, which the server cannot see.
 *
 * The PIN is checked here through verify_own_pin (the same attempt counter
 * and lockout as payments) and handed back so the purchase can carry it.
 * Palm is never offered: palm approval happens at a physical terminal.
 *
 * Content only, shown inside the purchase screen's one bottom sheet; `active`
 * is true while this step is the one on screen, and each activation starts
 * clean.
 */
export function AuthContent({
  active: visible,
  total,
  title,
  pinRequired,
  pinPrompt,
  onApproved,
}: {
  active: boolean;
  total: number;
  title: string;
  pinRequired: boolean;
  /** The server's own words when it asked for a PIN (wrong PIN, threshold). */
  pinPrompt?: string | null;
  onApproved: (pin?: string) => void;
}) {
  const c = useThemeColors();
  const verifyPin = useAuthStore((s) => s.verifyPin);
  const [capability, setCapability] = useState<BiometricCapability | null>(null);
  const [biometricAllowed, setBiometricAllowed] = useState(false);
  const [method, setMethod] = useState<Method>('pin');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [checking, setChecking] = useState(false);
  const promptingRef = useRef(false);
  // The parent passes a fresh callback on every render; reading it through a
  // ref keeps the opening effect below from re-running (and re-prompting the
  // fingerprint) each time the screen behind the sheet re-renders.
  const approvedRef = useRef(onApproved);
  approvedRef.current = onApproved;

  const reason = `Approve ${naira0(total)} to ${title}`;

  const tryBiometric = useCallback(async () => {
    if (promptingRef.current) return;
    promptingRef.current = true;
    const outcome = await promptBiometric(reason);
    promptingRef.current = false;
    if (outcome === 'success') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      approvedRef.current();
    } else if (outcome === 'failed') {
      setError("That didn't match. Try again, or use your PIN.");
    } else if (outcome === 'unavailable') {
      setBiometricAllowed(false);
      setMethod('pin');
    }
  }, [reason]);

  // Each opening starts clean and decides the method afresh.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setPin('');
    setError(null);
    (async () => {
      const [cap, enabled] = await Promise.all([getBiometricCapability(), isBiometricUnlockEnabled()]);
      if (cancelled) return;
      setCapability(cap);
      const allowed = !pinRequired && enabled && cap.hasHardware && cap.isEnrolled;
      setBiometricAllowed(allowed);
      setMethod(allowed ? 'biometric' : 'pin');
      if (allowed) void tryBiometric();
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, pinRequired, tryBiometric]);

  const submit = async (candidate: string) => {
    setChecking(true);
    const result = await verifyPin(candidate);
    setChecking(false);
    if (result.valid) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      approvedRef.current(candidate);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    setError(result.error ?? "That PIN isn't right.");
    setShake((n) => n + 1);
    setTimeout(() => setPin(''), 350);
  };

  const onDigit = (d: string) => {
    if (checking || pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    setError(null);
    if (next.length === 4) setTimeout(() => void submit(next), 150);
  };

  const bioLabel = capability?.label === 'Face ID' ? 'Face ID' : 'Fingerprint';
  const BioIcon = capability?.label === 'Face ID' ? ScanFace : Fingerprint;

  return (
    <View>
      <Text accessibilityRole="header" style={{ textAlign: 'center', color: c.text, fontSize: 20, fontFamily: 'Inter_800ExtraBold', letterSpacing: -0.4 }}>
        Confirm it's you
      </Text>
      <Text style={{ textAlign: 'center', marginTop: 4, color: c.muted, fontSize: 14, fontFamily: 'Inter_400Regular' }}>
        {naira0(total)} to {title}
      </Text>

      {biometricAllowed ? (
        <Toggle
          style={{ marginTop: 16 }}
          fontSize={13}
          value={method}
          onChange={(m) => {
            setMethod(m);
            setError(null);
            setPin('');
            if (m === 'biometric') void tryBiometric();
          }}
          options={[
            { value: 'biometric', label: bioLabel, icon: <BioIcon color={method === 'biometric' ? c.text : c.muted} size={16} /> },
            { value: 'pin', label: 'PIN', icon: <Lock color={method === 'pin' ? c.text : c.muted} size={16} /> },
          ]}
        />
      ) : null}

      {method === 'biometric' ? (
        <View style={{ alignItems: 'center', gap: 14, marginTop: 30, marginBottom: 20 }}>
          <Pressable
            onPress={() => void tryBiometric()}
            accessibilityRole="button"
            accessibilityLabel={`Approve with ${bioLabel.toLowerCase()}`}
            style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: c.brandSoft, alignItems: 'center', justifyContent: 'center' }}
          >
            <PulseRing colour={c.brand} active={visible} />
            <BioIcon color={c.brand} size={58} strokeWidth={1.5} />
          </Pressable>
          <Text style={{ color: c.text, fontSize: 15, fontFamily: 'Inter_600SemiBold' }}>
            {bioLabel === 'Face ID' ? 'Look at your phone' : 'Touch the fingerprint sensor'}
          </Text>
          <Text style={{ marginTop: -8, color: error ? c.fail : c.muted, fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' }}>
            {error ?? 'Tap the icon if the prompt closed'}
          </Text>
        </View>
      ) : (
        <View>
          {pinRequired || pinPrompt ? (
            <Text style={{ textAlign: 'center', marginTop: 16, color: c.muted, fontSize: 13, fontFamily: 'Inter_400Regular' }}>
              {pinPrompt ?? 'Enter your PIN to approve this amount.'}
            </Text>
          ) : null}
          <View style={{ marginTop: 24, marginBottom: 8 }}>
            <PinDots filled={pin.length} error={!!error} shakeKey={shake} compact />
          </View>
          <Text accessibilityLiveRegion="assertive" style={{ textAlign: 'center', minHeight: 18, marginBottom: 10, color: c.fail, fontSize: 13, fontFamily: 'Inter_400Regular' }}>
            {error ?? ''}
          </Text>
          <Keypad compact keyTone="chip" onDigit={onDigit} onDelete={() => setPin((p) => p.slice(0, -1))} disabled={checking} />
        </View>
      )}
    </View>
  );
}

/** The prototype's `ring`: scale .8 → 1.5 while fading .6 → 0, every 1.8 s. */
function PulseRing({ colour, active }: { colour: string; active: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (!active) return;
    t.value = 0;
    t.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.ease) }), -1);
    return () => cancelAnimation(t);
  }, [active, t]);
  const style = useAnimatedStyle(() => ({ opacity: 0.6 * (1 - t.value), transform: [{ scale: 0.8 + 0.7 * t.value }] }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: 60, borderWidth: 2, borderColor: colour }, style]}
    />
  );
}
