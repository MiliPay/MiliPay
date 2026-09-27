import React from 'react';
import { Text, View } from 'react-native';
import { FieldLabel, InputBox, OptionTile } from '../ds/Form';
import { useThemeColors } from '../../theme/useThemeColors';
import { naira0 } from '../../lib/purchaseForm';

/**
 * Airtime and electricity: six presets in a 3-column grid, then a free
 * amount box with a ₦ sign. A preset lights up only while the typed amount
 * equals it.
 */
export function AmountSection({
  presets,
  amount,
  onAmount,
}: {
  presets: number[];
  amount: number;
  onAmount: (n: number) => void;
}) {
  const c = useThemeColors();
  const rows = [presets.slice(0, 3), presets.slice(3, 6)];
  return (
    <View>
      <FieldLabel>Amount</FieldLabel>
      <View style={{ gap: 8, marginTop: 8, marginHorizontal: 20 }}>
        {rows.map((row, r) => (
          <View key={r} style={{ flexDirection: 'row', gap: 8 }}>
            {row.map((p) => (
              <OptionTile key={p} label={naira0(p)} selected={amount === p} onPress={() => onAmount(p)} style={{ flex: 1, height: 56 }}>
                <Text style={{ color: c.text, fontSize: 16, fontFamily: 'Inter_700Bold', fontVariant: ['tabular-nums'] }}>{naira0(p)}</Text>
              </OptionTile>
            ))}
          </View>
        ))}
      </View>
      <InputBox
        height={56}
        style={{ marginTop: 10, gap: 6 }}
        value={amount ? amount.toLocaleString('en-NG') : ''}
        onChangeText={(t) => onAmount(Number(t.replace(/[^0-9]/g, '').slice(0, 7)) || 0)}
        keyboardType="number-pad"
        placeholder="Enter amount"
        accessibilityLabel="Amount in naira"
        inputStyle={{ fontFamily: 'Inter_700Bold' }}
        left={<Text style={{ color: c.muted, fontSize: 18, fontFamily: 'Inter_700Bold' }}>₦</Text>}
      />
    </View>
  );
}
