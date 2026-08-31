import React from 'react';
import { View, ViewProps } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useColorScheme } from 'nativewind';

interface GlassCardProps extends ViewProps {
  children: React.ReactNode;
  intensity?: number;
}

export const GlassCard: React.FC<GlassCardProps> = ({ children, intensity = 20, style, ...props }) => {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme !== 'light';

  return (
    <View className="rounded-3xl overflow-hidden border border-black/5 dark:border-white/10" style={style} {...props}>
      <BlurView intensity={intensity} tint={isDark ? "dark" : "light"} className="absolute inset-0" />
      <LinearGradient
        colors={isDark ? ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.01)'] : ['rgba(255,255,255,0.5)', 'rgba(255,255,255,0.2)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        className="absolute inset-0"
      />
      <View className="p-6">
        {children}
      </View>
    </View>
  );
};
