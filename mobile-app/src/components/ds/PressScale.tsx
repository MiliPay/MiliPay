import React from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * The redesign's press state: buttons shrink to 0.98, round icon buttons to
 * 0.94 (README, "Interactions & behaviour"). One component so every tappable
 * thing in the app responds the same way.
 */
export function PressScale({
  scaleTo = 0.98,
  style,
  disabled,
  onPressIn,
  onPressOut,
  children,
  ...rest
}: PressableProps & { scaleTo?: number; style?: StyleProp<ViewStyle>; className?: string }) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        if (!disabled) scale.value = withTiming(scaleTo, { duration: 90 });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withTiming(1, { duration: 140 });
        onPressOut?.(e);
      }}
      style={[style, animated]}
    >
      {children}
    </AnimatedPressable>
  );
}
