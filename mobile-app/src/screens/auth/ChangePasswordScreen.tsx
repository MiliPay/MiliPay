import React, { useRef, useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, withTiming, useSharedValue, interpolateColor } from 'react-native-reanimated';
import { ShieldCheck } from 'lucide-react-native';

import { VaultInput, VaultInputRef } from '../../components/ui/VaultInput';
import { SecureButton } from '../../components/ui/SecureButton';
import { GlassCard } from '../../components/ui/GlassCard';

export default function ChangePasswordScreen({ navigation }: any) {
  const [step, setStep] = useState<1 | 2>(1);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<VaultInputRef>(null);

  // Security ring animation logic
  const securityLevel = useSharedValue(0);
  const [securityScore, setSecurityScore] = useState(0);
  
  React.useEffect(() => {
    // Simple mock heuristic for password strength
    let level = 0;
    if (newPassword.length > 3) level += 0.3;
    if (newPassword.length > 6) level += 0.3;
    if (/[A-Z]/.test(newPassword) && /[0-9]/.test(newPassword)) level += 0.4;
    
    setSecurityScore(level);
    securityLevel.value = withTiming(level, { duration: 300 });
  }, [newPassword]);

  const animatedRingStyle = useAnimatedStyle(() => {
    const borderColor = interpolateColor(
      securityLevel.value,
      [0, 0.5, 1],
      ['rgba(255,255,255,0.1)', 'rgba(234, 179, 8, 0.8)', 'rgba(16, 185, 129, 1)']
    );
    return { borderColor, borderWidth: 2 };
  });

  const handleNext = () => {
    if (step === 1) {
      if (newPassword.length < 4) {
        inputRef.current?.shake();
        return;
      }
      setStep(2);
    } else {
      if (newPassword !== confirmPassword) {
        inputRef.current?.shake();
        return;
      }
      setIsLoading(true);
      setTimeout(() => {
        setIsLoading(false);
        navigation.navigate('PinSetup');
      }, 1000);
    }
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
                <ShieldCheck color={securityScore === 1 ? "#10b981" : "rgba(255,255,255,0.4)"} size={40} strokeWidth={1.5} />
              </Animated.View>
              
              <Text className="text-white text-3xl font-inter-bold tracking-tight mb-2 text-center">
                {step === 1 ? 'Secure Your Vault' : 'Confirm Key'}
              </Text>
              <Text className="text-white/50 text-base font-inter text-center max-w-[280px]">
                {step === 1 
                  ? 'Create a permanent, bank-grade password for this identity.' 
                  : 'Verify your new password to proceed.'}
              </Text>
            </View>

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
                    <Text className={`text-xs font-inter-bold uppercase ${newPassword.length === 0 ? 'text-white/40' : securityScore > 0.8 ? 'text-emerald-400' : 'text-yellow-500'}`}>
                      {newPassword.length === 0 ? 'Empty' : securityScore > 0.8 ? 'Bank-Grade' : 'Weak'}
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
