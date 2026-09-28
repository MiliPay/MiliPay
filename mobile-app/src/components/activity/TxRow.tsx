import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Hand, Lightbulb, Receipt, Smartphone, Tv, Wifi, type LucideIcon } from 'lucide-react-native';
import { StatusChip } from '../ds/Chips';
import { useThemeColors, withAlpha } from '../../theme/useThemeColors';
import { serviceColors } from '../../theme/tokens';
import { naira2 } from '../../lib/purchaseForm';
import { isReturned, rowStatus } from '../../lib/statusView';
import { txService, whenLabel, type TxLike, type TxService } from '../../lib/activityView';

const BRAND_GREEN = '#00C896';

export const TX_ICONS: Record<TxService, LucideIcon> = {
  airtime: Smartphone,
  data: Wifi,
  power: Lightbulb,
  cable: Tv,
  palm: Hand,
  other: Receipt,
};

/** The icon tile's colour: the service's own, palm green, or brand for the rest. */
export function txColour(service: TxService): string {
  if (service === 'palm' || service === 'other') return BRAND_GREEN;
  return serviceColors[service];
}

/**
 * One history row (the prototype's `decorate`): a tinted 42 pt icon tile, the
 * name, when it happened with a status chip beside it, and the amount —
 * struck through and faint when the money never left or came back. A
 * delivered bill carries no chip; a palm payment carries "Palm".
 */
export const TxRow = React.memo(function TxRow({
  tx,
  onPress,
}: {
  tx: TxLike & { id: string };
  onPress: (id: string) => void;
}) {
  const c = useThemeColors();
  const service = txService(tx);
  const Icon = TX_ICONS[service];
  const colour = txColour(service);
  const chip = rowStatus(tx.status);
  const returned = isReturned(tx.status);
  const when = whenLabel(tx.created_at);

  return (
    <Pressable
      onPress={() => onPress(tx.id)}
      accessibilityRole="button"
      accessibilityLabel={`${tx.merchant_name ?? 'Payment'}, ${naira2(Number(tx.amount))}, ${when}${chip ? `, ${chip.label}` : ''}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 16,
        backgroundColor: pressed ? c.chip : 'transparent',
      })}
    >
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: 14,
          backgroundColor: withAlpha(colour, 0.14),
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon color={colour} size={20} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: c.text, fontSize: 15, fontFamily: 'Inter_600SemiBold' }}>
          {tx.merchant_name || 'Payment'}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
          <Text style={{ color: c.muted, fontSize: 12, fontFamily: 'Inter_400Regular' }}>{when}</Text>
          {chip ? (
            <StatusChip shape="tag" label={chip.label} tone={chip.tone} />
          ) : service === 'palm' ? (
            <StatusChip shape="tag" label="Palm" tone="brand" />
          ) : null}
        </View>
      </View>
      <Text
        style={{
          color: returned ? c.faint : c.text,
          fontSize: 15,
          fontFamily: 'Inter_700Bold',
          fontVariant: ['tabular-nums'],
          textDecorationLine: returned ? 'line-through' : 'none',
        }}
      >
        -{naira2(Number(tx.amount))}
      </Text>
    </Pressable>
  );
});

/** A card of rows (radius 20, 4 pt inset top and bottom), as both lists use. */
export function TxCard({ children }: { children: React.ReactNode }) {
  const c = useThemeColors();
  return (
    <View
      style={{
        paddingVertical: 4,
        backgroundColor: c.card,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: c.cardLine,
        boxShadow: c.shadow,
        overflow: 'hidden',
      }}
    >
      {children}
    </View>
  );
}
