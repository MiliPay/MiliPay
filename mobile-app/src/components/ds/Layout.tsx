import React from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { IconButton } from './IconButton';
import { useThemeColors } from '../../theme/useThemeColors';

/**
 * Page-level pieces of the redesign's layout (README, "Global layout" and
 * "Type scale"). Page padding is 20; cards are 14 apart; a section title sits
 * 20 below what is above it.
 */
export const PAGE_PADDING = 20;
export const CARD_GAP = 14;

/**
 * Pushed-screen header: 42 pt round back button, 17/700 title centred —
 * the prototype's `padding: 6px 16px 0`. `inset` is 24 on Change PIN, whose
 * whole screen has 24 pt sides.
 */
export function ScreenHeader({
  title,
  onBack,
  right,
  inset = 16,
}: {
  title: string;
  onBack?: () => void;
  right?: React.ReactNode;
  inset?: number;
}) {
  const c = useThemeColors();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: inset,
        paddingTop: 6,
      }}
    >
      <View style={{ width: 42 }}>
        {onBack ? <IconButton icon={ChevronLeft} label="Back" onPress={onBack} /> : null}
      </View>
      <Text
        accessibilityRole="header"
        numberOfLines={1}
        style={{ flex: 1, textAlign: 'center', color: c.text, fontSize: 17, fontFamily: 'Inter_700Bold' }}
      >
        {title}
      </Text>
      <View style={{ width: 42, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
}

/** Tab-screen title: 28/800, −0.025em. */
export function TabTitle({ children }: { children: React.ReactNode }) {
  const c = useThemeColors();
  return (
    <Text
      accessibilityRole="header"
      style={{ color: c.text, fontSize: 28, fontFamily: 'Inter_800ExtraBold', letterSpacing: -0.7 }}
    >
      {children}
    </Text>
  );
}

/** Section title: 16/700, 20 above. `action` is the right-hand link ("See all"). */
export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  const c = useThemeColors();
  return (
    <View style={{ marginTop: 20, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text accessibilityRole="header" style={{ color: c.text, fontSize: 16, fontFamily: 'Inter_700Bold' }}>
        {children}
      </Text>
      {action}
    </View>
  );
}

/** Small uppercase group label ("MONEY", "SECURITY"): 12/600, 0.08em, faint. */
export function GroupLabel({ children }: { children: React.ReactNode }) {
  const c = useThemeColors();
  return (
    <Text
      style={{
        color: c.faint,
        fontSize: 12,
        fontFamily: 'Inter_600SemiBold',
        letterSpacing: 0.96,
        textTransform: 'uppercase',
        paddingHorizontal: 4,
        paddingBottom: 8,
      }}
    >
      {children}
    </Text>
  );
}

/** A card: radius 20, card fill, hairline, the light theme's soft shadow. */
export function Card({
  children,
  style,
  padded = true,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  const c = useThemeColors();
  return (
    <View
      style={[
        {
          backgroundColor: c.card,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: c.cardLine,
          boxShadow: c.shadow,
          padding: padded ? 16 : 0,
          overflow: padded ? 'visible' : 'hidden',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
