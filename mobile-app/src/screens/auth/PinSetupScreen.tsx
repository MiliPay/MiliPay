import React, { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, withSpring, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { Dialpad } from '../../components/ui/Dialpad';

const PIN_LENGTH = 4;

const PinWell = ({ filled, isError }: { filled: boolean, isError: boolean }) => {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (filled) {
      scale.value = withSpring(1.2, {}, () => {
        scale.value = withSpring(1);
      });
    }
  }, [filled]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    backgroundColor: isError 
      ? 'rgba(239, 68, 68, 1)' 
      : filled ? 'rgba(16, 185, 129, 1)' : 'rgba(255,255,255,0.1)'
  }));

  return (
    <Animated.View 
      style={animatedStyle}
      className="w-5 h-5 rounded-full mx-3"
    />
  );
};

export default function PinSetupScreen({ navigation }: any) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [step, setStep] = useState<1 | 2>(1);
  const [isError, setIsError] = useState(false);
  const shakeOffset = useSharedValue(0);

  const currentDisplay = step === 1 ? pin : confirmPin;

  const handleKeyPress = (val: string) => {
    if (currentDisplay.length >= PIN_LENGTH) return;
    
    if (step === 1) {
      const newPin = pin + val;
      setPin(newPin);
      if (newPin.length === PIN_LENGTH) {
        setTimeout(() => setStep(2), 300);
      }
    } else {
      const newConfirm = confirmPin + val;
      setConfirmPin(newConfirm);
      if (newConfirm.length === PIN_LENGTH) {
        verifyPin(newConfirm);
      }
    }
  };

  const handleDelete = () => {
    if (isError) {
      setIsError(false);
      setConfirmPin('');
      return;
    }

    if (step === 1 && pin.length > 0) {
      setPin(pin.slice(0, -1));
    } else if (step === 2 && confirmPin.length > 0) {
      setConfirmPin(confirmPin.slice(0, -1));
    } else if (step === 2 && confirmPin.length === 0) {
      setStep(1); // Go back
    }
  };

  const verifyPin = (finalConfirm: string) => {
    if (pin === finalConfirm) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => navigation.navigate('BiometricSetup'), 500);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setIsError(true);
      shakeOffset.value = withSequence(
        withTiming(-10, { duration: 50 }),
        withTiming(10, { duration: 50 }),
        withTiming(-10, { duration: 50 }),
        withTiming(10, { duration: 50 }),
        withSpring(0, { damping: 10, stiffness: 400 })
      );
      setTimeout(() => {
        setConfirmPin('');
        setIsError(false);
      }, 500);
    }
  };

  const animatedShake = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeOffset.value }]
  }));

  return (
    <SafeAreaView className="flex-1 bg-black">
      <LinearGradient colors={['#000', 'rgba(16, 185, 129, 0.05)']} className="absolute inset-0" />
      
      <View className="flex-1 justify-between py-12">
        <View className="items-center px-6 mt-8">
          <Text className="text-white/50 text-sm font-inter-semibold uppercase tracking-widest mb-4">
            Step 2 of 3
          </Text>
          <Text className="text-white text-3xl font-inter-bold tracking-tight mb-2 text-center">
            {step === 1 ? 'Set Secondary Lock' : 'Confirm Secondary Lock'}
          </Text>
          <Text className="text-white/50 text-base font-inter text-center max-w-[280px]">
            {step === 1 
              ? 'Create a 4-digit PIN for authorizing merchant debits.' 
              : 'Re-enter your 4-digit PIN to confirm.'}
          </Text>

          <Animated.View style={animatedShake} className="flex-row mt-16 bg-white/5 p-6 rounded-full border border-white/5 shadow-2xl">
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <PinWell 
                key={i} 
                filled={i < currentDisplay.length} 
                isError={isError}
              />
            ))}
          </Animated.View>
        </View>

        <View className="pb-8">
          <Dialpad onPress={handleKeyPress} onDelete={handleDelete} />
        </View>
      </View>
    </SafeAreaView>
  );
}
