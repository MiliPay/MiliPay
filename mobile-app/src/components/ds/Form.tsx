import React from 'react';
import { Pressable, Text, TextInput, View, type TextInputProps } from 'react-native';
import { PressScale } from './PressScale';
import { useThemeColors, withAlpha } from '../../theme/useThemeColors';

/** A field's label: 13/600 muted, 22 above (the purchase screen's rhythm). */
export function FieldLabel({ children, top = 22 }: { children: React.ReactNode; top?: number }) {
  const c = useThemeColors();
  return (
    <Text style={{ marginTop: top, marginHorizontal: 20, color: c.muted, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>
      {children}
    </Text>
  );
}

/**
 * The redesign's text box: 58 tall (56 for amounts), radius 16, card fill,
 * 1.5 pt line. `left` / `right` hold the network badge, the ₦ sign, the
 * contacts button.
 */
export function InputBox({
  left,
  right,
  height = 58,
  style,
  inputStyle,
  ...input
}: TextInputProps & {
  left?: React.ReactNode;
  right?: React.ReactNode;
  height?: number;
  inputStyle?: TextInputProps['style'];
}) {
  const c = useThemeColors();
  return (
    <View
      style={[
        {
          marginTop: 8,
          marginHorizontal: 20,
          height,
          borderRadius: 16,
          backgroundColor: c.card,
          borderWidth: 1.5,
          borderColor: c.line,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingLeft: left ? 12 : 16,
          paddingRight: right ? 10 : 16,
        },
        style as object,
      ]}
    >
      {left}
      <TextInput
        placeholderTextColor={c.faint}
        {...input}
        style={[
          { flex: 1, height: '100%', color: c.text, fontSize: 18, fontFamily: 'Inter_600SemiBold', fontVariant: ['tabular-nums'] },
          inputStyle,
        ]}
      />
      {right}
    </View>
  );
}

/**
 * A selectable tile: brand-tinted with a coloured border when chosen, card
 * and line otherwise — the prototype's `sel()`. `tint` is the service's own
 * colour where the design uses one (orange discos, purple cable, blue plans).
 */
export function OptionTile({
  selected,
  onPress,
  tint = '#00C896',
  children,
  style,
  label,
}: {
  selected: boolean;
  onPress: () => void;
  tint?: string;
  children: React.ReactNode;
  style?: object;
  label: string;
}) {
  const c = useThemeColors();
  return (
    <PressScale
      scaleTo={0.97}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        {
          borderRadius: 16,
          borderWidth: 1.5,
          borderColor: selected ? tint : c.line,
          backgroundColor: selected ? withAlpha(tint, 0.1) : c.card,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      {children}
    </PressScale>
  );
}

/**
 * Two-way switch on a chip-coloured track (Prepaid · Postpaid, Fingerprint ·
 * PIN): the chosen side is a raised card with a small shadow.
 */
export function Toggle<T extends string>({
  options,
  value,
  onChange,
  style,
  fontSize = 14,
}: {
  options: { value: T; label: string; icon?: React.ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  style?: object;
  fontSize?: number;
}) {
  const c = useThemeColors();
  return (
    <View style={[{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: 14, backgroundColor: c.chip }, style]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              paddingVertical: 9,
              borderRadius: 11,
              backgroundColor: on ? c.card : 'transparent',
              boxShadow: on ? '0px 1px 3px rgba(0, 0, 0, 0.12)' : undefined,
            }}
          >
            {o.icon}
            <Text style={{ color: on ? c.text : c.muted, fontSize, fontFamily: 'Inter_600SemiBold' }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
