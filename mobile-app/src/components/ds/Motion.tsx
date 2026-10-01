import React, { useEffect } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { EASE_OUT } from './BottomSheet';

/**
 * The prototype's `ring` keyframes: a line that grows from 0.8× to 1.5× while
 * fading from 0.6 to 0, looping — round the fingerprint buttons, the welcome
 * logo and the palm on "You're all set". `outset` draws it that far outside
 * its parent (the welcome logo's inset: -10px); `radius` follows the parent's
 * corners.
 */
export function PulseRing({
  colour,
  active = true,
  duration = 1800,
  delay = 0,
  outset = 0,
  radius = 999,
}: {
  colour: string;
  active?: boolean;
  duration?: number;
  delay?: number;
  outset?: number;
  radius?: number;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (!active) return;
    t.value = 0;
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration, easing: Easing.out(Easing.ease) }), -1));
    return () => cancelAnimation(t);
  }, [active, delay, duration, t]);
  const style = useAnimatedStyle(() => ({ opacity: 0.6 * (1 - t.value), transform: [{ scale: 0.8 + 0.7 * t.value }] }));
  if (!active) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', top: -outset, right: -outset, bottom: -outset, left: -outset, borderRadius: radius, borderWidth: 2, borderColor: colour },
        style,
      ]}
    />
  );
}

type EnterKind = 'fade' | 'rise' | 'pop' | 'screenIn';

/**
 * How things arrive, from the prototype's keyframes:
 *   fade      opacity 0 → 1
 *   rise      14 pt up while fading in
 *   pop       0.5× → 1.08× → 1× while fading in
 *   screenIn  28 pt from the right while fading in (each setup step)
 */
export function Enter({
  kind = 'fade',
  duration,
  delay = 0,
  style,
  children,
}: {
  kind?: EnterKind;
  duration?: number;
  delay?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const p = useSharedValue(0);
  const ms = duration ?? (kind === 'screenIn' ? 280 : kind === 'pop' ? 600 : kind === 'rise' ? 500 : 300);
  useEffect(() => {
    p.value = 0;
    if (kind === 'pop') {
      p.value = withDelay(delay, withSequence(withTiming(0.7, { duration: ms * 0.7, easing: EASE_OUT }), withTiming(1, { duration: ms * 0.3 })));
    } else {
      p.value = withDelay(delay, withTiming(1, { duration: ms, easing: kind === 'fade' ? Easing.linear : EASE_OUT }));
    }
  }, [delay, kind, ms, p]);

  const animated = useAnimatedStyle(() => {
    const v = p.value;
    if (kind === 'pop') {
      // 0 → 0.7 of the time: 0.5 → 1.08; then back to 1.
      const scale = v <= 0.7 ? 0.5 + (1.08 - 0.5) * (v / 0.7) : 1.08 - 0.08 * ((v - 0.7) / 0.3);
      return { opacity: Math.min(1, v / 0.7), transform: [{ scale }] };
    }
    if (kind === 'rise') return { opacity: v, transform: [{ translateY: 14 * (1 - v) }] };
    if (kind === 'screenIn') return { opacity: v, transform: [{ translateX: 28 * (1 - v) }] };
    return { opacity: v };
  });

  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}
