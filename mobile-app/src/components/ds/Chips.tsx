import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { PressScale } from './PressScale';
import { useThemeColors } from '../../theme/useThemeColors';

export type ChipTone = 'warn' | 'fail' | 'muted' | 'brand';

/**
 * A status chip: "In progress", "Payment failed", "Refunded", "Palm".
 * 11/600 on a soft fill of the same tone (the prototype's TONE table).
 */
export function StatusChip({ label, tone }: { label: string; tone: ChipTone }) {
  const c = useThemeColors();
  const [bg, fg] =
    tone === 'warn' ? [c.warnSoft, c.warn]
    : tone === 'fail' ? [c.failSoft, c.fail]
    : tone === 'brand' ? [c.brandSoft, c.brandText]
    : [c.chip, c.muted];
  return (
    <View style={{ alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: bg }}>
      <Text style={{ color: fg, fontSize: 11, fontFamily: 'Inter_600SemiBold' }}>{label}</Text>
    </View>
  );
}

export interface FilterOption<T extends string | number | null> {
  value: T;
  label: string;
}

/**
 * A row of filter chips (Activity, Notifications). The selected chip is
 * filled with the text colour and its label drawn in the page colour — the
 * prototype's `bg: var(--text), fg: var(--bg)`. `variant="soft"` is the
 * second row's style (linked-bank filter): brand-tinted when selected.
 */
export function FilterChips<T extends string | number | null>({
  options,
  value,
  onChange,
  variant = 'solid',
}: {
  options: FilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
  variant?: 'solid' | 'soft';
}) {
  const c = useThemeColors();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}>
      {options.map((o) => {
        const on = o.value === value;
        const bg = on ? (variant === 'solid' ? c.text : c.brandSoft) : c.card;
        const fg = on ? (variant === 'solid' ? c.bg : c.brandText) : c.text;
        const bd = on ? (variant === 'solid' ? c.text : c.brand) : c.line;
        return (
          <PressScale
            key={String(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={{ paddingHorizontal: 14, height: 34, borderRadius: 999, borderWidth: 1, borderColor: bd, backgroundColor: bg, justifyContent: 'center' }}
          >
            <Text style={{ color: fg, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>{o.label}</Text>
          </PressScale>
        );
      })}
    </ScrollView>
  );
}
