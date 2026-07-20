import React, { forwardRef, useImperativeHandle } from 'react';
import { TextInput, View, TextInputProps, Pressable } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Eye, EyeOff } from 'lucide-react-native';

export interface VaultInputRef {
  shake: () => void;
}

interface VaultInputProps extends TextInputProps {
  label: string;
  isPassword?: boolean;
}

export const VaultInput = forwardRef<VaultInputRef, VaultInputProps>(({ label, isPassword, ...props }, ref) => {
  const [isSecure, setIsSecure] = React.useState(isPassword);
  const translateX = useSharedValue(0);

  useImperativeHandle(ref, () => ({
    shake: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      translateX.value = withSequence(
        withTiming(-10, { duration: 50 }),
        withTiming(10, { duration: 50 }),
        withTiming(-10, { duration: 50 }),
        withTiming(10, { duration: 50 }),
        withSpring(0, { damping: 10, stiffness: 400 })
      );
    }
  }));

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }]
  }));

  return (
    <Animated.View style={animatedStyle} className="mb-6">
      <View className="bg-white/5 border border-white/10 rounded-2xl h-16 px-5 flex-row items-center">
        <View className="flex-1">
          <TextInput
            placeholderTextColor="rgba(255,255,255,0.3)"
            secureTextEntry={isSecure}
            className="text-white text-lg font-mono-bold w-full h-full"
            {...props}
          />
        </View>
        {isPassword ? (
          <Pressable onPress={() => setIsSecure(!isSecure)} className="p-2">
            {isSecure ? <EyeOff color="rgba(255,255,255,0.5)" size={20} /> : <Eye color="rgba(255,255,255,0.5)" size={20} />}
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
});

VaultInput.displayName = 'VaultInput';
