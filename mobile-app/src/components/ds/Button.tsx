import React from 'react';
import { Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { PressScale } from './PressScale';
import { useThemeColors } from '../../theme/useThemeColors';
import { brandFixed } from '../../theme/tokens';

type Variant = 'primary' | 'outline' | 'danger';
type Size = 'lg' | 'md';

/**
 * The redesign's buttons.
 *
 *   lg  56 tall, radius 16, 16/700 — the main action on a screen
 *   md  52 tall, radius 14, 15/700 — actions inside cards and sheets
 *
 * `primary` is brand green with dark ink on it; `outline` is a card with a
 * 1.5 pt line; `danger` is the soft-red "Log out" style. A button that cannot
 * be pressed yet is drawn at 40% (the prototype's `opacity: .4`) and ignores
 * presses rather than disappearing, so the customer can see what comes next.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  icon: Icon,
  disabled,
  accessibilityHint,
}: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  disabled?: boolean;
  accessibilityHint?: string;
}) {
  const c = useThemeColors();
  const height = size === 'lg' ? 56 : 52;
  const radius = size === 'lg' ? 16 : 14;
  const fontSize = size === 'lg' ? 16 : 15;

  const bg = variant === 'primary' ? c.brand : variant === 'danger' ? c.failSoft : c.card;
  const fg = variant === 'primary' ? brandFixed.onBrand : variant === 'danger' ? c.fail : c.text;

  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={disabled ? undefined : onPress}
      style={{
        height,
        borderRadius: radius,
        backgroundColor: bg,
        borderWidth: variant === 'outline' ? 1.5 : 0,
        borderColor: c.line,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        {Icon ? <Icon color={fg} size={size === 'lg' ? 20 : 18} strokeWidth={2.4} /> : null}
        <Text style={{ color: fg, fontSize, fontFamily: variant === 'danger' ? 'Inter_600SemiBold' : 'Inter_700Bold' }}>
          {label}
        </Text>
      </View>
    </PressScale>
  );
}
