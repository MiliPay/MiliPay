import React, { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  withRepeat,
  withTiming,
  useSharedValue,
  withSequence,
  withSpring,
  interpolate,
  cancelAnimation,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Fingerprint, CheckCircle, ScanFace, ShieldOff } from 'lucide-react-native';

import { useAuthStore } from '../../store/useStore';
import { SecureButton } from '../../components/ui/SecureButton';
import {
  enrolBiometricUnlock,
  getBiometricCapability,
  type BiometricCapability,
} from '../../lib/deviceAuth';

/**
 * Enrol fingerprint / Face ID unlock.
 *
 * The previous version was a three-second animation that logged
 * "Biometric setup bypassed" and enrolled nothing. This one calls the OS
 * biometric prompt and only records success if the prompt actually succeeds.
 *
 * Skipping is allowed — the PIN remains the fallback everywhere — but the
 * choice is recorded rather than assumed.
 */
export default function BiometricSetupScreen() {
  const [isScanning, setIsScanning] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [capability, setCapability] = useState<BiometricCapability | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);

  const setBiometricEnrolled = useAuthStore((state) => state.setBiometricEnrolled);
  const completeOnboarding = useAuthStore((state) => state.completeOnboarding);

  const scanLineY = useSharedValue(0);
  const scale = useSharedValue(1);
  const successOpacity = useSharedValue(0);

  useEffect(() => {
    getBiometricCapability().then(setCapability);
  }, []);

  const stopAnimations = () => {
    cancelAnimation(scale);
    cancelAnimation(scanLineY);
    scale.value = withSpring(1);
    scanLineY.value = 0;
  };

  const finish = async (enrolled: boolean) => {
    setIsFinishing(true);
    if (enrolled) {
      await setBiometricEnrolled(true);
    }
    // Flips onboarding_completed_at, which is what AppNavigator watches; the
    // navigator swaps to the tab bar on the next render.
    await completeOnboarding();
    setIsFinishing(false);
  };

  const handleStartScan = async () => {
    setErrorMessage(null);
    setIsScanning(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    scale.value = withRepeat(
      withSequence(withTiming(1.05, { duration: 500 }), withTiming(0.95, { duration: 500 })),
      -1,
      true
    );
    scanLineY.value = withRepeat(withTiming(100, { duration: 1200 }), -1, true);

    const enrolled = await enrolBiometricUnlock(
      'Confirm it is you to enable biometric unlock'
    );

    stopAnimations();
    setIsScanning(false);

    if (!enrolled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrorMessage(
        capability?.hasHardware && capability?.isEnrolled
          ? 'That did not match. You can try again, or skip and use your PIN.'
          : `No ${capability?.label.toLowerCase() ?? 'biometrics'} are set up on this phone. Add one in your device settings, or skip and use your PIN.`
      );
      return;
    }

    setIsSuccess(true);
    scale.value = withSpring(1.1);
    successOpacity.value = withTiming(1, { duration: 400 });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    await finish(true);
  };

  const animatedScannerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const animatedLineStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(scanLineY.value, [0, 100], [-50, 50]) }],
    opacity: isScanning ? 1 : 0,
  }));

  const animatedSuccessStyle = useAnimatedStyle(() => ({
    opacity: successOpacity.value,
    transform: [{ scale: successOpacity.value === 0 ? 0.5 : withSpring(1) }],
  }));

  const isFaceId = capability?.label === 'Face ID';
  const BiometricIcon = isFaceId ? ScanFace : Fingerprint;
  const unsupported = capability !== null && (!capability.hasHardware || !capability.isEnrolled);

  return (
    <SafeAreaView className="flex-1 bg-black">
      <LinearGradient colors={['#000', 'rgba(0, 200, 150, 0.1)']} className="absolute inset-0" />

      <View className="flex-1 justify-between py-12 px-6">
        <View className="items-center mt-12">
          <Text className="text-white/50 text-sm font-inter-semibold uppercase tracking-widest mb-4">
            Step 3 of 3
          </Text>
          <Text className="text-white text-3xl font-inter-bold tracking-tight mb-2 text-center">
            {isSuccess ? 'Identity Secured' : `Enable ${capability?.label ?? 'Biometric'} Unlock`}
          </Text>
          <Text className="text-white/50 text-base font-inter text-center max-w-[300px]">
            {isSuccess
              ? 'This device can now confirm it is you when you link a bank or approve a payment.'
              : unsupported
              ? 'This phone has no biometrics set up. Your PIN will be used instead.'
              : `Confirm with ${capability?.label.toLowerCase() ?? 'your fingerprint'} before linking a bank account. Your PIN stays available as a fallback.`}
          </Text>
        </View>

        <View className="items-center justify-center flex-1">
          <Pressable
            onPress={!isScanning && !isSuccess && !unsupported ? handleStartScan : undefined}
            accessibilityRole="button"
            accessibilityLabel={`Enable ${capability?.label ?? 'biometric'} unlock`}
          >
            <Animated.View
              style={animatedScannerStyle}
              className={`w-40 h-40 rounded-full border-2 items-center justify-center overflow-hidden ${
                isSuccess
                  ? 'border-signal bg-signal/10'
                  : unsupported
                  ? 'border-white/5 bg-white/[0.02]'
                  : 'border-white/10 bg-white/5'
              }`}
            >
              {isSuccess ? (
                <Animated.View style={animatedSuccessStyle}>
                  <CheckCircle size={64} color="#00C896" strokeWidth={1.5} />
                </Animated.View>
              ) : unsupported ? (
                <ShieldOff size={64} color="rgba(255,255,255,0.15)" strokeWidth={1} />
              ) : (
                <>
                  <BiometricIcon
                    size={64}
                    color={isScanning ? '#00C896' : 'rgba(255,255,255,0.2)'}
                    strokeWidth={1}
                  />
                  <Animated.View
                    style={animatedLineStyle}
                    className="absolute w-full h-1 bg-signal-bright"
                  />
                </>
              )}
            </Animated.View>
          </Pressable>

          {!isScanning && !isSuccess && !unsupported ? (
            <Text className="text-white/30 text-sm font-inter uppercase mt-8 tracking-widest">
              Tap to enrol
            </Text>
          ) : null}

          {errorMessage ? (
            <View className="mt-8 px-4">
              <Text className="text-red-400 font-inter text-sm text-center">{errorMessage}</Text>
            </View>
          ) : null}
        </View>

        <View className="pb-4">
          <SecureButton
            title={unsupported ? 'Continue with PIN only' : 'Skip for now'}
            variant="secondary"
            onPress={() => finish(false)}
            disabled={isScanning || isSuccess || isFinishing}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
