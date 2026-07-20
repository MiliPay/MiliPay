import React from 'react';
import { Pressable, Text, PressableProps, ActivityIndicator } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface SecureButtonProps extends PressableProps {
  title: string;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
}

export const SecureButton: React.FC<SecureButtonProps> = ({ 
  title, 
  loading = false, 
  variant = 'primary', 
  onPress, 
  ...props 
}) => {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  const handlePressIn = () => {
    scale.value = withSpring(0.97, { damping: 15, stiffness: 300 });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  const getVariantStyles = () => {
    switch (variant) {
      case 'secondary':
        return 'bg-white/10 border border-white/20';
      case 'danger':
        return 'bg-red-500/20 border border-red-500/50';
      default:
        return 'bg-transparent'; // Linear gradient handles primary
    }
  };

  const getTextColor = () => {
    switch (variant) {
      case 'danger':
        return 'text-red-400';
      default:
        return 'text-white';
    }
  };

  return (
    <AnimatedPressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      disabled={loading || props.disabled}
      className={`rounded-2xl h-14 flex items-center justify-center overflow-hidden ${getVariantStyles()} ${
        props.disabled ? 'opacity-50' : 'opacity-100'
      }`}
      style={animatedStyle}
      {...props}
    >
      {(variant === 'primary' && !props.disabled) ? (
        <LinearGradient
          colors={['#10b981', '#059669']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          className="absolute inset-0"
        />
      ) : null}
      
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? 'white' : '#10b981'} />
      ) : (
        <Text className={`font-inter-semibold text-lg tracking-wide ${getTextColor()}`}>
          {title}
        </Text>
      )}
    </AnimatedPressable>
  );
};
