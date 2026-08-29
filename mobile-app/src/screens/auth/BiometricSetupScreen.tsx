import React, { useState } from 'react';
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
  interpolate 
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Fingerprint, CheckCircle } from 'lucide-react-native';

import { useAuthStore } from '../../store/useStore';
import { SecureButton } from '../../components/ui/SecureButton';

export default function BiometricSetupScreen() {
  const [isScanning, setIsScanning] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const login = useAuthStore(state => state.login);

  const scanLineY = useSharedValue(0);
  const scale = useSharedValue(1);
  const successOpacity = useSharedValue(0);

  const handleStartScan = () => {
    setIsScanning(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    
    // Simulate biometric scanning pulse
    scale.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 500 }),
        withTiming(0.95, { duration: 500 })
      ),
      -1,
      true
    );

    scanLineY.value = withRepeat(
      withTiming(100, { duration: 1200 }),
      -1,
      true
    );

    // Simulate success after 3 seconds
    setTimeout(() => {
      setIsScanning(false);
      setIsSuccess(true);
      scale.value = withSpring(1.1);
      successOpacity.value = withTiming(1, { duration: 400 });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      setTimeout(() => {
        console.log("Biometric setup bypassed");
      }, 2000);
    }, 3000);
  };

  const animatedScannerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }));

  const animatedLineStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(scanLineY.value, [0, 100], [-50, 50]) }],
    opacity: isScanning ? 1 : 0
  }));

  const animatedSuccessStyle = useAnimatedStyle(() => ({
    opacity: successOpacity.value,
    transform: [{ scale: successOpacity.value === 0 ? 0.5 : withSpring(1) }]
  }));

  return (
    <SafeAreaView className="flex-1 bg-black">
      <LinearGradient colors={['#000', 'rgba(16, 185, 129, 0.1)']} className="absolute inset-0" />
      
      <View className="flex-1 justify-between py-12 px-6">
        <View className="items-center mt-12">
          <Text className="text-white/50 text-sm font-inter-semibold uppercase tracking-widest mb-4">
            Final Step
          </Text>
          <Text className="text-white text-3xl font-inter-bold tracking-tight mb-2 text-center">
            {isSuccess ? 'Identity Secured' : 'Bind Your Identity'}
          </Text>
          <Text className="text-white/50 text-base font-inter text-center max-w-[280px]">
            {isSuccess 
              ? 'Your device is now securely linked to the MiliPay network.' 
              : 'Your fingerprint is now your wallet. Secure your account.'}
          </Text>
        </View>

        <View className="items-center justify-center flex-1">
          <Pressable onPress={!isScanning && !isSuccess ? handleStartScan : undefined}>
            <Animated.View 
              style={animatedScannerStyle}
              className={`w-40 h-40 rounded-full border-2 items-center justify-center overflow-hidden
                ${isSuccess ? 'border-emerald-500 bg-emerald-500/10' : 'border-white/10 bg-white/5'}
              `}
            >
              {!isSuccess ? (
                <>
                  <Fingerprint 
                    size={64} 
                    color={isScanning ? "#10b981" : "rgba(255,255,255,0.2)"} 
                    strokeWidth={1} 
                  />
                  <Animated.View 
                    style={animatedLineStyle}
                    className="absolute w-full h-1 bg-emerald-400 shadow-[0_0_15px_rgba(16,218,129,1)]" 
                  />
                </>
              ) : (
                <Animated.View style={animatedSuccessStyle}>
                  <CheckCircle size={64} color="#10b981" strokeWidth={1.5} />
                </Animated.View>
              )}
            </Animated.View>
          </Pressable>
          
          {(!isScanning && !isSuccess) ? (
            <Text className="text-white/30 text-sm font-inter uppercase mt-8 tracking-widest">
              Tap to Scan
            </Text>
          ) : null}
        </View>

        <View className="pb-4">
          <SecureButton
            title="Skip for now"
            variant="secondary"
            onPress={() => console.log("Skip biometric setup")}
            disabled={isScanning || isSuccess}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
