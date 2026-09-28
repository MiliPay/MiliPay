import React, { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Tap } from './Tap';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeColors } from '../../theme/useThemeColors';
import { GroupLabel } from './Layout';

/**
 * The redesign's switch: 48×28 track, 22 pt white knob, brand green when on.
 * A real switch to assistive tech (role + checked state), not a painted one.
 */
export function Switch({ value, onChange, label }: { value: boolean; onChange: (next: boolean) => void; label: string }) {
  const c = useThemeColors();
  const x = useSharedValue(value ? 20 : 0);
  useEffect(() => {
    x.value = withTiming(value ? 20 : 0, { duration: 200 });
  }, [value, x]);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      hitSlop={8}
      style={{ width: 48, height: 28, borderRadius: 14, padding: 3, backgroundColor: value ? c.brand : c.line }}
    >
      <Animated.View
        style={[
          { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF', boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.2)' },
          knob,
        ]}
      />
    </Pressable>
  );
}

/** A group of settings rows under an uppercase label, on one card. */
export function SettingsGroup({ title, children }: { title?: string; children: React.ReactNode }) {
  const c = useThemeColors();
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={{ marginTop: 18, marginHorizontal: 20 }}>
      {title ? <GroupLabel>{title}</GroupLabel> : null}
      <View
        style={{
          backgroundColor: c.card,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: c.cardLine,
          boxShadow: c.shadow,
          overflow: 'hidden',
        }}
      >
        {rows.map((row, i) => (
          <View key={i} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}>
            {row}
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * One settings row: 36 pt tinted icon tile, label (15/500) and optional
 * sub-line (12, muted), then on the right a value + chevron, a switch, or
 * whatever `right` is (the Appearance segment). The whole row is the target.
 */
export function SettingsRow({
  icon: Icon,
  label,
  sub,
  value,
  onPress,
  right,
  iconBg,
  iconColor,
  labelColor,
  chevron,
}: {
  icon: LucideIcon;
  label: string;
  sub?: string;
  value?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  iconBg?: string;
  iconColor?: string;
  labelColor?: string;
  chevron?: boolean;
}) {
  const c = useThemeColors();
  return (
    <Tap
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={value ? `${label}, ${value}` : label}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 13,
        paddingHorizontal: 16,
        backgroundColor: pressed ? c.chip : 'transparent',
      })}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 11,
          backgroundColor: iconBg ?? c.chip,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon color={iconColor ?? c.muted} size={18} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: labelColor ?? c.text, fontSize: 15, fontFamily: 'Inter_500Medium' }}>{label}</Text>
        {sub ? <Text style={{ color: c.muted, fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 }}>{sub}</Text> : null}
      </View>
      {right}
      {value || chevron ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {value ? <Text style={{ color: c.muted, fontSize: 13, fontFamily: 'Inter_400Regular' }}>{value}</Text> : null}
          <ChevronRight color={c.faint} size={18} />
        </View>
      ) : null}
    </Tap>
  );
}

/** Two-option segment ("Light · Dark"), as on the Me › Appearance row. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const c = useThemeColors();
  return (
    <View style={{ flexDirection: 'row', gap: 2, padding: 3, borderRadius: 10, backgroundColor: c.chip }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: on ? c.card : 'transparent' }}
          >
            <Text style={{ color: on ? c.text : c.muted, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Round initials avatar.
 *   soft  brand-tinted (Home header 44, Profile 58)
 *   hero  green gradient, white 800, a 3 pt brand-soft ring (Me header 46)
 */
export function Avatar({
  firstName,
  lastName,
  size = 44,
  variant = 'soft',
}: {
  firstName?: string | null;
  lastName?: string | null;
  size?: number;
  variant?: 'soft' | 'hero';
}) {
  const c = useThemeColors();
  const initials = `${(firstName ?? '').trim()[0] ?? ''}${(lastName ?? '').trim()[0] ?? ''}`.toUpperCase() || 'ME';
  const fontSize = Math.round(size * 0.345);
  const text = (
    <Text
      style={{
        color: variant === 'hero' ? '#FFFFFF' : c.brandText,
        fontSize,
        fontFamily: variant === 'hero' ? 'Inter_800ExtraBold' : 'Inter_700Bold',
      }}
    >
      {initials}
    </Text>
  );
  const frame = { width: size, height: size, borderRadius: size / 2, alignItems: 'center' as const, justifyContent: 'center' as const };

  if (variant === 'hero') {
    return (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ borderRadius: size / 2, boxShadow: `0px 0px 0px 3px ${c.brandSoft}` }}
      >
        <LinearGradient colors={['#0A7A5A', '#022C22']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={frame}>
          {text}
        </LinearGradient>
      </View>
    );
  }
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[frame, { backgroundColor: c.brandSoft }]}>
      {text}
    </View>
  );
}
