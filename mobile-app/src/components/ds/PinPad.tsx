import React from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Delete } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useThemeColors } from '../../theme/useThemeColors';
import { useShake } from './useShake';

/**
 * PIN dots: 18 pt rings 18 apart; filled brand green (and 1.1× larger) as
 * digits arrive; all red while `error` is set. `shakeKey` replays the shake —
 * pass a counter that goes up on each wrong entry.
 */
export function PinDots({ length = 4, filled, error, shakeKey }: { length?: number; filled: number; error?: boolean; shakeKey?: number }) {
  const c = useThemeColors();
  const shake = useShake(shakeKey);
  return (
    <Animated.View
      accessible
      accessibilityLabel={`${filled} of ${length} digits entered`}
      style={[{ flexDirection: 'row', gap: 18, justifyContent: 'center' }, shake]}
    >
      {Array.from({ length }, (_, i) => {
        const on = i < filled;
        const colour = error ? c.fail : on ? c.brand : c.faint;
        return (
          <View
            key={i}
            style={{
              width: 18,
              height: 18,
              borderRadius: 9,
              borderWidth: 2,
              borderColor: colour,
              backgroundColor: error || on ? colour : 'transparent',
              transform: [{ scale: on ? 1.1 : 1 }],
            }}
          />
        );
      })}
    </Animated.View>
  );
}

/**
 * The number pad: 3 columns 10 apart, keys 60 tall with radius 18, 24/600.
 * `keyTone` is the key fill — `card` on full screens (onboarding, Change PIN),
 * `chip` inside sheets (payment approval) — as in the prototype. It only
 * reports digits and deletes; what four digits mean is the caller's business.
 */
export function Keypad({
  onDigit,
  onDelete,
  keyTone = 'card',
  disabled,
}: {
  onDigit: (digit: string) => void;
  onDelete: () => void;
  keyTone?: 'card' | 'chip';
  disabled?: boolean;
}) {
  const c = useThemeColors();
  const rows = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['', '0', 'del']];
  return (
    <View style={{ gap: 10 }}>
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', gap: 10 }}>
          {row.map((k, i) => {
            if (k === '') return <View key={i} style={{ flex: 1, height: 60 }} />;
            const isDel = k === 'del';
            return (
              <Pressable
                key={i}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={isDel ? 'Delete' : k}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  if (isDel) onDelete();
                  else onDigit(k);
                }}
                style={({ pressed }) => ({
                  flex: 1,
                  height: 60,
                  borderRadius: 18,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: pressed ? c.line : isDel ? 'transparent' : keyTone === 'card' ? c.card : c.chip,
                })}
              >
                {isDel ? (
                  <Delete color={c.text} size={24} />
                ) : (
                  <Text style={{ color: c.text, fontSize: 24, fontFamily: 'Inter_600SemiBold' }}>{k}</Text>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
