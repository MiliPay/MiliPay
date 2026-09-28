import React from 'react';
import { Text, View } from 'react-native';
import { Tap } from './Tap';
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
export function PinDots({
  length = 4,
  filled,
  error,
  shakeKey,
  compact,
}: {
  length?: number;
  filled: number;
  error?: boolean;
  shakeKey?: number;
  /** The approval sheet's 16 pt dots, 16 apart. */
  compact?: boolean;
}) {
  const c = useThemeColors();
  const shake = useShake(shakeKey);
  const size = compact ? 16 : 18;
  return (
    <Animated.View
      accessible
      accessibilityLabel={`${filled} of ${length} digits entered`}
      style={[{ flexDirection: 'row', gap: compact ? 16 : 18, justifyContent: 'center' }, shake]}
    >
      {Array.from({ length }, (_, i) => {
        const on = i < filled;
        const colour = error ? c.fail : on ? c.brand : c.faint;
        return (
          <View
            key={i}
            style={{
              width: size,
              height: size,
              borderRadius: size / 2,
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
  compact,
  disabled,
}: {
  onDigit: (digit: string) => void;
  onDelete: () => void;
  keyTone?: 'card' | 'chip';
  /** The approval sheet's smaller keys: 54 tall, radius 14, 22 pt, 8 apart. */
  compact?: boolean;
  disabled?: boolean;
}) {
  const c = useThemeColors();
  const rows = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['', '0', 'del']];
  const height = compact ? 54 : 60;
  const radius = compact ? 14 : 18;
  const fontSize = compact ? 22 : 24;
  const gap = compact ? 8 : 10;
  return (
    <View style={{ gap }}>
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', gap }}>
          {row.map((k, i) => {
            if (k === '') return <View key={i} style={{ flex: 1, height }} />;
            const isDel = k === 'del';
            return (
              <Tap
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
                  height,
                  borderRadius: radius,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: pressed ? c.line : isDel ? 'transparent' : keyTone === 'card' ? c.card : c.chip,
                })}
              >
                {isDel ? (
                  <Delete color={c.text} size={fontSize} />
                ) : (
                  <Text style={{ color: c.text, fontSize, fontFamily: 'Inter_600SemiBold' }}>{k}</Text>
                )}
              </Tap>
            );
          })}
        </View>
      ))}
    </View>
  );
}
