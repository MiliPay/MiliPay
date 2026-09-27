import React from 'react';
import { Text, View } from 'react-native';
import { Lightbulb, Smartphone, Tv, Wifi, type LucideIcon } from 'lucide-react-native';
import { PressScale } from '../ds/PressScale';
import { useThemeColors, withAlpha } from '../../theme/useThemeColors';
import { serviceColors } from '../../theme/tokens';
import { SERVICE_LABELS, type ServiceKey } from '../../lib/purchaseForm';

export const SERVICE_ICONS: Record<ServiceKey, LucideIcon> = {
  airtime: Smartphone,
  data: Wifi,
  power: Lightbulb,
  cable: Tv,
};

/**
 * The 4-tab service switcher at the top of the purchase screen: a tinted icon
 * tile and label per service; the chosen one takes its colour at 8% with a
 * border of the colour itself.
 */
export function ServiceTabs({ value, onChange }: { value: ServiceKey; onChange: (s: ServiceKey) => void }) {
  const c = useThemeColors();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 8, marginTop: 16, marginHorizontal: 20 }}>
      {(Object.keys(SERVICE_LABELS) as ServiceKey[]).map((key) => {
        const Icon = SERVICE_ICONS[key];
        const colour = serviceColors[key];
        const on = key === value;
        return (
          <PressScale
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={SERVICE_LABELS[key]}
            onPress={() => onChange(key)}
            style={{
              flex: 1,
              paddingVertical: 10,
              paddingHorizontal: 4,
              borderRadius: 16,
              alignItems: 'center',
              gap: 6,
              backgroundColor: on ? withAlpha(colour, 0.08) : c.card,
              borderWidth: 1.5,
              borderColor: on ? colour : c.cardLine,
            }}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                backgroundColor: withAlpha(colour, 0.14),
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon color={colour} size={19} strokeWidth={2} />
            </View>
            <Text style={{ color: c.text, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>{SERVICE_LABELS[key]}</Text>
          </PressScale>
        );
      })}
    </View>
  );
}
