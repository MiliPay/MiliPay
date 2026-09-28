import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Check, Landmark } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Button } from '../ds/Button';
import { useThemeColors, withAlpha } from '../../theme/useThemeColors';
import { bankCardTheme, serviceColors } from '../../theme/tokens';
import { feeLabel, naira2, type ServiceKey } from '../../lib/purchaseForm';
import type { QuickPayState } from '../../lib/quickPayCopy';
import { SERVICE_ICONS } from './ServiceTabs';

export interface PayFromAccount {
  id: string;
  bankName: string;
  accountNumber: string;
  /** Position among linked accounts — decides the card colour. */
  index: number;
  quickPay: QuickPayState | null;
}

/**
 * The confirm step: service tile, what is being bought, the total, the
 * summary rows with the REAL fee, and the account it is paid from — tap to
 * switch to another linked account.
 *

 * Content only: the purchase screen shows it inside its one bottom sheet,
 * which swaps confirm → approve → progress in place like the prototype —
 * stacking a sheet per step makes iOS drop the next one.
 */
export function ConfirmPayContent({
  service,
  title,
  total,
  rows,
  fee,
  account,
  canChangeAccount,
  onChangeAccount,
  onConfirm,
}: {
  service: ServiceKey;
  title: string;
  total: number;
  rows: [string, string][];
  fee: number;
  account: PayFromAccount | null;
  canChangeAccount: boolean;
  onChangeAccount: () => void;
  onConfirm: () => void;
}) {
  const c = useThemeColors();
  const Icon = SERVICE_ICONS[service];
  const colour = serviceColors[service];
  const allRows: { k: string; v: string; brand?: boolean }[] = [
    ...rows.map(([k, v]) => ({ k, v })),
    { k: 'Fee', v: feeLabel(fee), brand: true },
  ];
  const theme = bankCardTheme(account?.index ?? 0);

  return (
    <View>
      <View style={{ alignItems: 'center', gap: 4 }}>
        <View style={{ width: 52, height: 52, borderRadius: 17, backgroundColor: withAlpha(colour, 0.14), alignItems: 'center', justifyContent: 'center' }}>
          <Icon color={colour} size={24} />
        </View>
        <Text style={{ marginTop: 8, color: c.muted, fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center' }}>{title}</Text>
        <Text style={{ color: c.text, fontSize: 36, fontFamily: 'Inter_800ExtraBold', letterSpacing: -0.9, fontVariant: ['tabular-nums'] }}>
          {naira2(total)}
        </Text>
      </View>

      <View style={{ marginTop: 16, paddingVertical: 4, paddingHorizontal: 16, borderRadius: 18, backgroundColor: c.input }}>
        {allRows.map((r, i) => (
          <View key={r.k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}>
            <Text style={{ color: c.muted, fontSize: 14, fontFamily: 'Inter_400Regular' }}>{r.k}</Text>
            <Text style={{ flexShrink: 1, textAlign: 'right', color: r.brand ? c.brandText : c.text, fontSize: 14, fontFamily: 'Inter_600SemiBold' }}>
              {r.v}
            </Text>
          </View>
        ))}
      </View>

      {account ? (
        <Pressable
          onPress={canChangeAccount ? onChangeAccount : undefined}
          accessibilityRole={canChangeAccount ? 'button' : undefined}
          accessibilityLabel={`Pay from ${account.bankName} ending ${account.accountNumber.slice(-4)}${canChangeAccount ? '. Double tap to change' : ''}`}
          style={({ pressed }) => ({
            marginTop: 10,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingVertical: 12,
            paddingHorizontal: 14,
            borderRadius: 18,
            borderWidth: 1.5,
            borderColor: c.line,
            backgroundColor: pressed ? c.chip : 'transparent',
          })}
        >
          <LinearGradient
            colors={theme.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
          >
            <Landmark color="#FFFFFF" size={17} />
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.muted, fontSize: 12, fontFamily: 'Inter_400Regular' }}>Pay from</Text>
            <Text style={{ color: c.text, fontSize: 15, fontFamily: 'Inter_600SemiBold' }}>
              {account.bankName} ••{account.accountNumber.slice(-4)}
            </Text>

          </View>
          {canChangeAccount ? <Text style={{ color: c.brandText, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>Change</Text> : null}
        </Pressable>
      ) : null}

      <View style={{ marginTop: 16 }}>
        <Button label="Confirm" icon={Check} onPress={onConfirm} />
      </View>
    </View>
  );
}
