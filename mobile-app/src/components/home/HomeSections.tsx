import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight, Hand, LayoutGrid } from 'lucide-react-native';

import { PressScale } from '../ds/PressScale';
import { useThemeColors, withAlpha } from '../../theme/useThemeColors';
import { serviceColors } from '../../theme/tokens';
import { HOME_ROW_SERVICES, SERVICE_GROUPS, SERVICE_TILES, type ServiceTile, type ServiceType } from '../../lib/services';

/**
 * Home's Palm Pay card. Tap → the Palm tab.
 *
 * Says only what is known: whether an agent has captured this customer's
 * palm. Which account palm payments come from, and pausing them, arrive with
 * the Palm tab itself.
 */
export function PalmCard({ enrolled, onPress }: { enrolled: boolean; onPress: () => void }) {
  const c = useThemeColors();
  return (
    <PressScale
      scaleTo={0.99}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Palm Pay, ${enrolled ? 'active' : 'not enrolled'}`}
      style={{
        marginHorizontal: 20,
        marginTop: 16,
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        backgroundColor: c.card,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: c.cardLine,
        boxShadow: c.shadow,
      }}
    >
      <LinearGradient
        colors={['#0A7A5A', '#022C22']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ width: 54, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}
      >
        <Hand color="#33E0B5" size={26} strokeWidth={2} />
      </LinearGradient>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: c.text, fontSize: 15, fontFamily: 'Inter_700Bold' }}>Palm Pay</Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: 999,
              backgroundColor: enrolled ? c.brandSoft : c.chip,
            }}
          >
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: enrolled ? c.brandText : c.muted }} />
            <Text style={{ color: enrolled ? c.brandText : c.muted, fontSize: 11, fontFamily: 'Inter_600SemiBold' }}>
              {enrolled ? 'Active' : 'Not enrolled'}
            </Text>
          </View>
        </View>
        <Text style={{ color: c.muted, fontSize: 13, lineHeight: 17.5, fontFamily: 'Inter_400Regular' }}>
          {enrolled
            ? 'Palm veins captured · pay at any MiliPay terminal'
            : 'Visit a MiliPay agent to enrol your palm.'}
        </Text>
      </View>
      <ChevronRight color={c.faint} size={20} />
    </PressScale>
  );
}

function ServiceSquare({
  tile,
  size,
  onPress,
}: {
  tile: ServiceTile | { key: 'more'; label: string };
  size: number;
  onPress?: () => void;
}) {
  const c = useThemeColors();
  const more = tile.key === 'more';
  const live = more || (tile as ServiceTile).service !== null;
  const colour = more ? c.brandText : live ? serviceColors[(tile as ServiceTile).service!] : c.faint;
  const bg = more ? c.chip : live ? withAlpha(colour, 0.14) : c.chip;
  const Icon = more ? LayoutGrid : (tile as ServiceTile).icon;
  return (
    <Pressable
      onPress={live ? onPress : undefined}
      disabled={!live}
      accessibilityRole="button"
      accessibilityLabel={live ? tile.label : `${tile.label}, coming soon`}
      style={({ pressed }) => ({ alignItems: 'center', gap: 8, paddingBottom: 8, opacity: pressed ? 0.65 : 1 })}
    >
      <View style={{ width: size, height: size, borderRadius: 17, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
        <Icon color={colour} size={24} strokeWidth={2} />
      </View>
      <Text numberOfLines={1} style={{ color: live ? c.text : c.faint, fontSize: 12, fontFamily: 'Inter_500Medium' }}>
        {tile.label}
      </Text>
      {!live ? (
        <Text style={{ marginTop: -6, color: c.faint, fontSize: 10, fontFamily: 'Inter_600SemiBold' }}>Soon</Text>
      ) : null}
    </Pressable>
  );
}

/** Home's "Pay bills" card: the four live services and More, five across. */
export function PayBillsCard({
  onOpen,
  onAll,
}: {
  onOpen: (service: ServiceType) => void;
  onAll: () => void;
}) {
  const c = useThemeColors();
  return (
    <View
      style={{
        marginHorizontal: 20,
        marginTop: 14,
        paddingTop: 16,
        paddingHorizontal: 8,
        paddingBottom: 6,
        backgroundColor: c.card,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: c.cardLine,
        boxShadow: c.shadow,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 10, paddingBottom: 14 }}>
        <Text accessibilityRole="header" style={{ color: c.text, fontSize: 16, fontFamily: 'Inter_700Bold', letterSpacing: -0.16 }}>
          Pay bills
        </Text>
        <Pressable onPress={onAll} hitSlop={8} accessibilityRole="button">
          <Text style={{ color: c.brandText, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>All services</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row' }}>
        {HOME_ROW_SERVICES.map((tile) => (
          <View key={tile.key} style={{ flex: 1 }}>
            <ServiceSquare tile={tile} size={52} onPress={() => onOpen(tile.service)} />
          </View>
        ))}
        <View style={{ flex: 1 }}>
          <ServiceSquare tile={{ key: 'more', label: 'More' }} size={52} onPress={onAll} />
        </View>
      </View>
    </View>
  );
}

/**
 * The "All services" sheet's contents: Top up, Bills and utilities,
 * Lifestyle, four across. Services with no provider behind them yet are
 * shown faint with "Soon" and do nothing — the roadmap is visible without
 * the app pretending to sell what it cannot deliver.
 */
export function AllServices({ onOpen }: { onOpen: (service: ServiceType) => void }) {
  const c = useThemeColors();
  return (
    <View>
      {SERVICE_GROUPS.map((group) => {
        const tiles = SERVICE_TILES.filter((t) => t.group === group.id);
        if (tiles.length === 0) return null;
        return (
          <View key={group.id}>
            <Text
              style={{
                marginTop: 16,
                marginBottom: 12,
                color: c.faint,
                fontSize: 12,
                fontFamily: 'Inter_600SemiBold',
                letterSpacing: 0.96,
                textTransform: 'uppercase',
              }}
            >
              {group.title}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 16 }}>
              {tiles.map((tile) => (
                <View key={tile.key} style={{ width: '25%' }}>
                  <ServiceSquare tile={tile} size={54} onPress={tile.service ? () => onOpen(tile.service!) : undefined} />
                </View>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}
