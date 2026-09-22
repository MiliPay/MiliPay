import React, { useRef, useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, withTiming, useSharedValue, interpolateColor } from 'react-native-reanimated';
import { ShieldCheck } from 'lucide-react-native';

import { VaultInput, VaultInputRef } from '../../components/ui/VaultInput';
import { SecureButton } from '../../components/ui/SecureButton';
import { GlassCard } from '../../components/ui/GlassCard';
import { useAuthStore } from '../../store/useStore';

/** Supabase rejects anything shorter than 6; 8 is the MiliPay floor. */
const MIN_PASSWORD_LENGTH = 8;

function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Include at least one letter and one number.';
  }
  return null;
}

export default function ChangePasswordScreen({ navigation }: any) {
  const [step, setStep] = useState<1 | 2>(1);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inputRef = useRef<VaultInputRef>(null);
  const changePassword = useAuthStore((state) => state.changePassword);

  // Security ring animation logic
  const securityLevel = useSharedValue(0);
  const [securityScore, setSecurityScore] = useState(0);
  
  React.useEffect(() => {
    let level = 0;
    if (newPassword.length >= MIN_PASSWORD_LENGTH) level += 0.3;
    if (newPassword.length >= 12) level += 0.2;
    if (/[A-Za-z]/.test(newPassword) && /[0-9]/.test(newPassword)) level += 0.3;
    if (/[^A-Za-z0-9]/.test(newPassword)) level += 0.2;

    setSecurityScore(level);
    securityLevel.value = withTiming(level, { duration: 300 });
  }, [newPassword]);

  const animatedRingStyle = useAnimatedStyle(() => {
    const borderColor = interpolateColor(
      securityLevel.value,
      [0, 0.5, 1],
      ['rgba(255,255,255,0.1)', 'rgba(234, 179, 8, 0.8)', 'rgba(0, 200, 150, 1)']
    );
    return { borderColor, borderWidth: 2 };
  });

  /**
   * Actually changes the password.
   *
   * The previous version ran a 1s setTimeout and navigated on — the one-time
   * password stayed live, which meant anyone who saw it in transit kept access
   * indefinitely.
   */
  const handleNext = async () => {
    setErrorMessage(null);

    if (step === 1) {
      const problem = passwordProblem(newPassword);
      if (problem) {
        setErrorMessage(problem);
        inputRef.current?.shake();
        return;
      }
      setStep(2);
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('The two passwords do not match.');
      inputRef.current?.shake();
      return;
    }

    setIsLoading(true);
    const result = await changePassword(newPassword);
    setIsLoading(false);

    if (!result.success) {
      setErrorMessage(result.error || 'Could not update your password. Please try again.');
      setStep(1);
      setConfirmPassword('');
      inputRef.current?.shake();
      return;
    }

    navigation.navigate('PinSetup');
  };

  return (
    <SafeAreaView className="flex-1 bg-black">
      <LinearGradient colors={['#000', '#000']} className="absolute inset-0" />
      
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View className="flex-1 justify-center px-6">
            
            <View className="items-center mb-12">
              <Animated.View 
                style={animatedRingStyle}
                className="w-24 h-24 rounded-full bg-white/5 items-center justify-center mb-6 shadow-xl"
              >
                <ShieldCheck color={securityScore === 1 ? "#00C896" : "rgba(255,255,255,0.4)"} size={40} strokeWidth={1.5} />
              </Animated.View>
              
              <Text className="text-white text-3xl font-inter-bold tracking-tight mb-2 text-center">
                {step === 1 ? 'Secure Your Vault' : 'Confirm Key'}
              </Text>
              <Text className="text-white/50 text-base font-inter text-center max-w-[280px]">
                {step === 1
                  ? 'Replace the one-time password you were sent. It stops working once you do.'
                  : 'Verify your new password to proceed.'}
              </Text>
            </View>

            {errorMessage ? (
              <View className="mb-5 rounded-xl border border-red-900/40 bg-red-950/40 p-3">
                <Text className="text-red-400 font-inter text-sm text-center">{errorMessage}</Text>
              </View>
            ) : null}

            <GlassCard intensity={20} className="mb-8">
              {step === 1 ? (
                <>
                  <Text className="text-white/60 text-sm font-inter-semibold uppercase tracking-widest mb-3 ml-1">
                    New Password
                  </Text>
                  <VaultInput
                    ref={inputRef}
                    label="New Password"
                    placeholder="Enter new password"
                    isPassword
                    value={newPassword}
                    onChangeText={setNewPassword}
                    autoFocus
                  />
                  <View className="flex-row justify-between mt-2 px-1">
                    <Text className="text-white/40 text-xs font-inter uppercase">Security Strength</Text>
                    <Text className={`text-xs font-inter-bold uppercase ${newPassword.length === 0 ? 'text-white/40' : securityScore >= 0.8 ? 'text-signal-bright' : securityScore >= 0.6 ? 'text-yellow-500' : 'text-red-400'}`}>
                      {newPassword.length === 0
                        ? 'Empty'
                        : securityScore >= 0.8
                        ? 'Strong'
                        : securityScore >= 0.6
                        ? 'Acceptable'
                        : 'Too weak'}
                    </Text>
                  </View>
                </>
              ) : (
                <>
                  <Text className="text-white/60 text-sm font-inter-semibold uppercase tracking-widest mb-3 ml-1">
                    Confirm Password
                  </Text>
                  <VaultInput
                    ref={inputRef}
                    label="Confirm Password"
                    placeholder="Re-enter password"
                    isPassword
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    autoFocus
                  />
                </>
              )}
            </GlassCard>

            <SecureButton
              title={step === 1 ? "Continue" : "Update Password"}
              loading={isLoading}
              onPress={handleNext}
            />
            
            {step === 2 ? (
              <View className="mt-4">
                <SecureButton
                  title="Back"
                  variant="secondary"
                  onPress={() => setStep(1)}
                />
              </View>
            ) : null}

          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
