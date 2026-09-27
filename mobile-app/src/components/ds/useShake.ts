import { useEffect } from 'react';
import { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

/**
 * The prototype's `shake` keyframes — 0 → −10 → 10 → −8 → 6 → 0 px over
 * 350 ms — replayed every time `trigger` changes to a new truthy value. Used
 * for a wrong PIN and a wrong code.
 */
export function useShake(trigger: unknown) {
  const x = useSharedValue(0);
  useEffect(() => {
    if (!trigger) return;
    const step = { duration: 70 };
    x.value = withSequence(
      withTiming(-10, step),
      withTiming(10, step),
      withTiming(-8, step),
      withTiming(6, step),
      withTiming(0, step),
    );
  }, [trigger, x]);
  return useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
}
