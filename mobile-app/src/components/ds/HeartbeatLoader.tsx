import React, { useEffect } from 'react';
import { Modal, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useThemeColors } from '../../theme/useThemeColors';

const MARK = require('../../../assets/splash-mark.png');

/**
 * Every blocking load in the redesign: the page colour and the logo mark
 * beating — scale 1 → 1.14 → 1 → 1.09 → 1 over 1.3 s, looping (the
 * prototype's `heartbeat` keyframes: 0/14/28/42/70/100 %). No text, no
 * spinner (README, screen 2).
 *
 * Mounted as a full-screen modal so it covers whatever is loading, tab bar
 * included. A screen reader hears "Loading", because the picture alone says
 * nothing to someone who cannot see it.
 */
export function HeartbeatLoader({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <HeartbeatFill />
    </Modal>
  );
}

/** The loader's contents, for places that are already full-screen (boot). */
export function HeartbeatFill() {
  const c = useThemeColors();
  const scale = useSharedValue(1);

  useEffect(() => {
    const ease = Easing.inOut(Easing.ease);
    // Durations are the keyframe gaps of a 1300 ms cycle.
    scale.value = withRepeat(
      withSequence(
        withTiming(1.14, { duration: 182, easing: ease }), // 0 → 14%
        withTiming(1, { duration: 182, easing: ease }), // → 28%
        withTiming(1.09, { duration: 182, easing: ease }), // → 42%
        withTiming(1, { duration: 364, easing: ease }), // → 70%
        withTiming(1, { duration: 390 }), // hold → 100%
      ),
      -1,
    );
    return () => cancelAnimation(scale);
  }, [scale]);

  const beat = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}
    >
      <Animated.Image source={MARK} resizeMode="contain" style={[{ width: 150, height: 150 }, beat]} />
    </View>
  );
}
