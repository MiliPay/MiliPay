import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { Check } from 'lucide-react-native';

import { BottomSheet, EASE_OUT } from '../ds/BottomSheet';
import { Button } from '../ds/Button';
import { useThemeColors } from '../../theme/useThemeColors';
import { brandFixed } from '../../theme/tokens';

/**
 * The redesign's "it's done" sheet — "PIN changed", "Changes saved": a 72 pt
 * green tick that pops in, the title and a line under it, optional rows on
 * the input fill, and Done.
 */
export function DoneSheet({
  visible,
  title,
  sub,
  rows,
  onClose,
}: {
  visible: boolean;
  title: string;
  sub: string;
  rows?: { k: string; v: string }[];
  onClose: () => void;
}) {
  const c = useThemeColors();
  // `pop`: .5 → 1.08 → 1 over 0.5 s, each time it opens.
  const scale = useSharedValue(0.5);
  useEffect(() => {
    if (!visible) return;
    scale.value = 0.5;
    scale.value = withSequence(withTiming(1.08, { duration: 350, easing: EASE_OUT }), withTiming(1, { duration: 150, easing: EASE_OUT }));
  }, [visible, scale]);
  const pop = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ alignItems: 'center', gap: 6 }}>
        <Animated.View style={[{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#00C896', alignItems: 'center', justifyContent: 'center' }, pop]}>
          <Check color={brandFixed.onBrand} size={34} strokeWidth={3} />
        </Animated.View>
        <Text accessibilityRole="header" style={{ marginTop: 10, color: c.text, fontSize: 20, fontFamily: 'Inter_800ExtraBold', letterSpacing: -0.4 }}>
          {title}
        </Text>
        <Text style={{ paddingHorizontal: 16, color: c.muted, fontSize: 14, lineHeight: 20, fontFamily: 'Inter_400Regular', textAlign: 'center' }}>
          {sub}
        </Text>
      </View>
      {rows && rows.length > 0 ? (
        <View style={{ marginTop: 16, paddingVertical: 4, paddingHorizontal: 16, borderRadius: 18, backgroundColor: c.input }}>
          {rows.map((r, i) => (
            <View key={r.k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}>
              <Text style={{ color: c.muted, fontSize: 14, fontFamily: 'Inter_400Regular' }}>{r.k}</Text>
              <Text style={{ color: c.text, fontSize: 14, fontFamily: 'Inter_700Bold', fontVariant: ['tabular-nums'], textAlign: 'right' }}>{r.v}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <View style={{ marginTop: rows && rows.length > 0 ? 16 : 20 }}>
        <Button label="Done" onPress={onClose} />
      </View>
    </BottomSheet>
  );
}
