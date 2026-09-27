import React from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../ds/Button';
import { useThemeColors } from '../../theme/useThemeColors';
import type { PayHint } from '../../lib/purchaseForm';

/**
 * The purchase screen's sticky footer: one line of guidance ("Enter the full
 * 11-digit number", "No fee · paid straight from your bank") over the Pay
 * button, which reads "Pay ₦x" once there is an amount and stays at 40%
 * until the form is complete.
 */
export function PayBar({
  hint,
  label,
  enabled,
  onPay,
}: {
  hint: PayHint | null;
  label: string;
  enabled: boolean;
  onPay: () => void;
}) {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingTop: 12,
        paddingHorizontal: 20,
        paddingBottom: Math.max(insets.bottom + 8, 20),
        backgroundColor: c.bg,
        borderTopWidth: 1,
        borderTopColor: c.line,
        gap: 8,
      }}
    >
      {hint ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{ textAlign: 'center', fontSize: 12, fontFamily: 'Inter_400Regular', color: hint.tone === 'fail' ? c.fail : c.muted }}
        >
          {hint.text}
        </Text>
      ) : null}
      <Button label={label} onPress={onPay} disabled={!enabled} />
    </View>
  );
}
