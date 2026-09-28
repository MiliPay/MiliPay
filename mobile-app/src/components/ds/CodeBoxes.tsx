import React, { useRef } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useThemeColors } from '../../theme/useThemeColors';
import { useShake } from './useShake';

/**
 * The redesign's 6-box one-time-code input: one hidden text field under six
 * drawn boxes, so the keyboard, paste and the OS's SMS-code autofill all work
 * normally. Boxes are 58 tall, radius 14, 24/700; the next box to fill has a
 * brand border, filled ones a faint border, and every box turns red while
 * `error` is set (with the shake replayed by `shakeKey`). `tone="input"` is
 * the sheet version (Profile's "Confirm your new email"): 56 tall on the input
 * fill, filled boxes keeping the plain hairline.
 */
export function CodeBoxes({
  value,
  onChange,
  length = 6,
  error,
  shakeKey,
  autoFocus = true,
  tone = 'card',
}: {
  value: string;
  onChange: (next: string) => void;
  length?: number;
  error?: boolean;
  shakeKey?: number;
  autoFocus?: boolean;
  tone?: 'card' | 'input';
}) {
  const c = useThemeColors();
  const input = useRef<TextInput>(null);
  const shake = useShake(shakeKey);

  return (
    <Pressable onPress={() => input.current?.focus()} accessible={false}>
      <Animated.View style={[{ flexDirection: 'row', gap: 8 }, shake]}>
        {Array.from({ length }, (_, i) => {
          const ch = value[i] ?? '';
          const border = error ? c.fail : i === value.length ? c.brand : ch && tone === 'card' ? c.faint : c.line;
          return (
            <View
              key={i}
              style={{
                flex: 1,
                height: tone === 'input' ? 56 : 58,
                borderRadius: 14,
                backgroundColor: tone === 'input' ? c.input : c.card,
                borderWidth: 1.5,
                borderColor: border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: c.text, fontSize: 24, fontFamily: 'Inter_700Bold' }}>{ch}</Text>
            </View>
          );
        })}
      </Animated.View>
      <TextInput
        ref={input}
        value={value}
        onChangeText={(t) => onChange(t.replace(/[^0-9]/g, '').slice(0, length))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        autoFocus={autoFocus}
        maxLength={length}
        caretHidden
        accessibilityLabel={`${length}-digit code`}
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, opacity: 0.01, color: 'transparent' }}
      />
    </Pressable>
  );
}
