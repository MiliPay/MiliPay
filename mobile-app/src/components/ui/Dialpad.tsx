import React from 'react';
import { View, Text, Pressable } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Delete } from 'lucide-react-native';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface DialpadProps {
  onPress: (value: string) => void;
  onDelete: () => void;
}

const DialButton = ({ value, label, onPress }: { value: string, label?: string, onPress: (v: string) => void }) => {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.9, { damping: 15, stiffness: 300 });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  return (
    <AnimatedPressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={() => onPress(value)}
      className="w-20 h-20 rounded-full flex items-center justify-center bg-white/5 border border-white/10 m-2"
      style={animatedStyle}
    >
      <Text className="text-white text-3xl font-mono-bold">{value}</Text>
      {label ? <Text className="text-white/40 text-[10px] font-inter uppercase mt-1">{label}</Text> : null}
    </AnimatedPressable>
  );
};

export const Dialpad: React.FC<DialpadProps> = ({ onPress, onDelete }) => {
  const scale = useSharedValue(1);
  const deleteAnimatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <View className="flex flex-col items-center justify-center w-full max-w-sm self-center">
      <View className="flex flex-row justify-between w-full">
        <DialButton value="1" onPress={onPress} />
        <DialButton value="2" label="ABC" onPress={onPress} />
        <DialButton value="3" label="DEF" onPress={onPress} />
      </View>
      <View className="flex flex-row justify-between w-full">
        <DialButton value="4" label="GHI" onPress={onPress} />
        <DialButton value="5" label="JKL" onPress={onPress} />
        <DialButton value="6" label="MNO" onPress={onPress} />
      </View>
      <View className="flex flex-row justify-between w-full">
        <DialButton value="7" label="PQRS" onPress={onPress} />
        <DialButton value="8" label="TUV" onPress={onPress} />
        <DialButton value="9" label="WXYZ" onPress={onPress} />
      </View>
      <View className="flex flex-row justify-between w-full">
        {/* Empty space */}
        <View className="w-20 h-20 m-2" />
        <DialButton value="0" onPress={onPress} />
        <AnimatedPressable
          onPressIn={() => { scale.value = withSpring(0.9); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          onPressOut={() => { scale.value = withSpring(1); }}
          onPress={onDelete}
          style={deleteAnimatedStyle}
          className="w-20 h-20 rounded-full flex items-center justify-center m-2"
        >
          <Delete color="rgba(255,255,255,0.7)" size={28} />
        </AnimatedPressable>
      </View>
    </View>
  );
};
