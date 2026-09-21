import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Modal, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Fingerprint, ScanFace, X } from 'lucide-react-native';

import { Dialpad } from './Dialpad';
import { useAuthStore } from '../../store/useStore';
import {
  getBiometricCapability,
  isBiometricUnlockEnabled,
  promptBiometric,
  type BiometricCapability,
} from '../../lib/deviceAuth';

const PIN_LENGTH = 4;

interface Props {
  visible: boolean;
  /** Shown in the OS prompt and as the sheet subtitle. */
  reason: string;
  /**
   * Skip the fingerprint and demand the PIN.
   *
   * Above the customer's PIN threshold the server requires the PIN itself —
   * a fingerprint is checked by the phone, which the server cannot verify, so
   * biometrics alone cannot authorise a large payment. Below the threshold the
   * fingerprint is enough and this stays false.
   */
  requirePin?: boolean;
  /**
   * Carries the PIN when one was entered, so the caller can pass it to a
   * server call that needs to check it again. Undefined after a biometric.
   */
  onConfirmed: (pin?: string) => void;
  onCancel: () => void;
}

const PinWell = ({ filled, isError }: { filled: boolean; isError: boolean }) => (
  <View
    className="w-4 h-4 rounded-full mx-2.5"
    style={{
      backgroundColor: isError
        ? 'rgba(239, 68, 68, 1)'
        : filled
        ? 'rgba(16, 185, 129, 1)'
        : 'rgba(255,255,255,0.12)',
    }}
  />
);

/**
 * Confirms the customer before a sensitive action: fingerprint / Face ID first,
 * the MiliPay PIN as the fallback.
 *
 * The PIN is checked server-side by verify_own_pin, which shares the payment
 * path's failed-attempt counter and 15-minute lockout — so this is not a softer
 * door into the same account.
 */
export function ConfirmIdentitySheet({
  visible,
  reason,
  requirePin = false,
  onConfirmed,
  onCancel,
}: Props) {
  const [mode, setMode] = useState<'checking' | 'biometric' | 'pin'>('checking');
  const [pin, setPin] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isError, setIsError] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [capability, setCapability] = useState<BiometricCapability | null>(null);

  const verifyPin = useAuthStore((state) => state.verifyPin);
  const shakeOffset = useSharedValue(0);

  const reject = useCallback(
    (text: string) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setIsError(true);
      setMessage(text);
      shakeOffset.value = withSequence(
        withTiming(-10, { duration: 50 }),
        withTiming(10, { duration: 50 }),
        withTiming(-10, { duration: 50 }),
        withSpring(0, { damping: 10, stiffness: 400 })
      );
      setTimeout(() => {
        setPin('');
        setIsError(false);
      }, 500);
    },
    [shakeOffset]
  );

  const tryBiometric = useCallback(async () => {
    const outcome = await promptBiometric(reason);

    if (outcome === 'success') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onConfirmed();
      return;
    }

    setMode('pin');
    if (outcome === 'failed') {
      setMessage('Biometric check failed. Enter your PIN instead.');
    } else if (outcome === 'unavailable') {
      setMessage(null);
    }
  }, [reason, onConfirmed]);

  // Reset and re-run the check each time the sheet opens.
  useEffect(() => {
    if (!visible) return;

    let cancelled = false;
    setPin('');
    setMessage(null);
    setIsError(false);
    setMode('checking');

    (async () => {
      const [cap, enabled] = await Promise.all([
        getBiometricCapability(),
        isBiometricUnlockEnabled(),
      ]);
      if (cancelled) return;

      setCapability(cap);

      if (requirePin) {
        // The server will verify this PIN itself, so offering a fingerprint
        // here would only be a nicer way of arriving at the same keypad.
        setMode('pin');
        setMessage('Enter your PIN to authorise this amount.');
      } else if (enabled && cap.hasHardware && cap.isEnrolled) {
        setMode('biometric');
        await tryBiometric();
      } else {
        setMode('pin');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, tryBiometric, requirePin]);

  const submitPin = useCallback(
    async (candidate: string) => {
      setIsVerifying(true);
      const result = await verifyPin(candidate);
      setIsVerifying(false);

      if (result.valid) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onConfirmed(candidate);
        return;
      }
      reject(result.error ?? 'Incorrect PIN.');
    },
    [verifyPin, onConfirmed, reject]
  );

  const handleKeyPress = (value: string) => {
    if (pin.length >= PIN_LENGTH || isVerifying) return;
    const next = pin + value;
    setPin(next);
    if (next.length === PIN_LENGTH) {
      submitPin(next);
    }
  };

  const animatedShake = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeOffset.value }],
  }));

  const BiometricIcon = capability?.label === 'Face ID' ? ScanFace : Fingerprint;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <View className="flex-1 bg-black/80">
        <SafeAreaView className="flex-1 justify-end">
          <View className="bg-zinc-950 rounded-t-3xl border-t border-white/10 pb-8">
            <View className="flex-row items-center justify-between px-6 pt-5 pb-2">
              <Text className="text-white font-inter-bold text-lg">Confirm it&apos;s you</Text>
              <Pressable onPress={onCancel} hitSlop={12} accessibilityLabel="Cancel">
                <X color="rgba(255,255,255,0.5)" size={22} />
              </Pressable>
            </View>

            <Text className="text-white/50 font-inter text-sm px-6 mb-6">{reason}</Text>

            {mode === 'checking' || mode === 'biometric' ? (
              <View className="items-center py-10">
                <View className="w-24 h-24 rounded-full border-2 border-emerald-500/40 bg-emerald-500/10 items-center justify-center mb-6">
                  <BiometricIcon size={44} color="#10b981" strokeWidth={1.2} />
                </View>
                <Text className="text-white/60 font-inter text-sm">
                  Waiting for {capability?.label.toLowerCase() ?? 'biometrics'}…
                </Text>
                <Pressable onPress={() => setMode('pin')} className="mt-6" hitSlop={8}>
                  <Text className="text-emerald-400 font-inter-medium text-sm">Use PIN instead</Text>
                </Pressable>
              </View>
            ) : (
              <View className="items-center">
                <Animated.View style={animatedShake} className="flex-row justify-center my-6">
                  {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                    <PinWell key={i} filled={i < pin.length} isError={isError} />
                  ))}
                </Animated.View>

                <View className="h-6 justify-center">
                  {isVerifying ? (
                    <ActivityIndicator color="#10b981" size="small" />
                  ) : message ? (
                    <Text
                      className={`font-inter text-xs text-center px-8 ${
                        isError ? 'text-red-400' : 'text-white/50'
                      }`}
                    >
                      {message}
                    </Text>
                  ) : null}
                </View>

                <View className="mt-2">
                  <Dialpad
                    onPress={handleKeyPress}
                    onDelete={() => setPin((p) => p.slice(0, -1))}
                  />
                </View>

                {capability?.hasHardware && capability?.isEnrolled ? (
                  <Pressable onPress={tryBiometric} className="mt-3 mb-2" hitSlop={8}>
                    <Text className="text-emerald-400 font-inter-medium text-sm">
                      Use {capability.label.toLowerCase()} instead
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            )}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
