import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gift, Hand, Home, Receipt, User, type LucideIcon } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useThemeColors } from '../theme/useThemeColors';
import { brandFixed } from '../theme/tokens';

const TABS: Record<string, { label: string; icon: LucideIcon; center?: boolean }> = {
  HomeTab: { label: 'Home', icon: Home },
  ActivityTab: { label: 'Activity', icon: Receipt },
  PalmTab: { label: 'Palm', icon: Hand, center: true },
  RewardsTab: { label: 'Rewards', icon: Gift },
  MeTab: { label: 'Me', icon: User },
};

/**
 * The redesign's tab bar: five tabs, Palm raised in the middle as a 58 pt
 * green disc cut out of the bar by a 5 pt ring of the bar's own colour.
 * Active tabs are brand text with a 2.4 stroke; the rest are faint at 2.
 *
 * Hidden whenever a screen has been pushed inside a tab (a purchase, a
 * receipt, Profile…) — the prototype shows the bar only on the five tab
 * screens themselves.
 */
export function AppTabBar({ state, navigation }: BottomTabBarProps) {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();

  const focused = state.routes[state.index];
  const nested = focused.state as { index?: number } | undefined;
  if (nested?.index && nested.index > 0) return null;

  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        backgroundColor: c.tab,
        borderTopWidth: 1,
        borderTopColor: c.line,
        paddingTop: 8,
        paddingHorizontal: 6,
        paddingBottom: Math.max(insets.bottom, 12),
      }}
    >
      {state.routes.map((route, index) => {
        const def = TABS[route.name];
        if (!def) return null;
        const active = state.index === index;
        const colour = active ? c.brandText : c.faint;
        const Icon = def.icon;

        const onPress = () => {
          // Emitted even for the tab already showing: a stack inside it
          // answers tabPress by returning to its first screen.
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!active && !event.defaultPrevented) {
            Haptics.selectionAsync().catch(() => {});
            navigation.navigate(route.name, route.params);
          }
        };

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={def.label}
            onPress={onPress}
            style={{ flex: 1, alignItems: 'center', gap: 4 }}
          >
            {def.center ? (
              <View
                style={{
                  width: 58,
                  height: 58,
                  marginTop: -26,
                  borderRadius: 29,
                  backgroundColor: '#00C896',
                  borderWidth: 5,
                  borderColor: c.tab,
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0px 8px 18px -6px rgba(0, 200, 150, 0.6)',
                }}
              >
                <Hand color={brandFixed.onBrand} size={26} strokeWidth={2} />
              </View>
            ) : (
              <View style={{ height: 28, justifyContent: 'center' }}>
                <Icon color={colour} size={24} strokeWidth={active ? 2.4 : 2} />
              </View>
            )}
            <Text style={{ color: colour, fontSize: 11, fontFamily: 'Inter_600SemiBold' }}>{def.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
