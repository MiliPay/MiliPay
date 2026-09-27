import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { Check } from 'lucide-react-native';
import { useThemeColors } from '../../theme/useThemeColors';
import { brandFixed } from '../../theme/tokens';
import { PROGRESS_STEPS, progressIndex } from '../../lib/statusView';
import { STATUS_COPY, type TransactionStatus } from '../../lib/transactionStatus';

/**
 * The live progress step: Paying from your bank → Payment confirmed →
 * Sending to provider → Delivered, following the transaction's real status
 * (never a timer). The purchase screen shows it in its bottom sheet with
 * dismissing turned off, and moves on to the receipt when the purchase
 * settles.
 */
export function ProgressContent({ status }: { status: TransactionStatus }) {
  const c = useThemeColors();
  const step = progressIndex(status);
  const delivered = status === 'delivered';

  return (
    <View>
      <Text accessibilityRole="header" style={{ color: c.text, fontSize: 20, fontFamily: 'Inter_800ExtraBold', letterSpacing: -0.4 }}>
        {delivered ? 'Delivered' : 'Processing your payment'}
      </Text>
      <Text accessibilityLiveRegion="polite" style={{ marginTop: 4, color: c.muted, fontSize: 14, fontFamily: 'Inter_400Regular' }}>
        {STATUS_COPY[status] ?? STATUS_COPY.initiated}
      </Text>

      <View style={{ marginTop: 20 }}>
        {PROGRESS_STEPS.map((label, i) => {
          const done = delivered || i < step;
          const current = !delivered && i === step;
          return (
            <View key={label} style={{ flexDirection: 'row', gap: 14 }}>
              <View style={{ alignItems: 'center' }}>
                <View
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 15,
                    borderWidth: 2,
                    borderColor: done ? '#00C896' : current ? c.brand : c.line,
                    backgroundColor: done ? '#00C896' : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {done ? <Check color={brandFixed.onBrand} size={16} strokeWidth={3} /> : null}
                  {current ? <Spinner colour={c.brand} /> : null}
                </View>
                {i < PROGRESS_STEPS.length - 1 ? (
                  <View style={{ width: 2, height: 22, backgroundColor: i < step || delivered ? '#00C896' : c.line }} />
                ) : null}
              </View>
              <Text
                style={{
                  paddingTop: 5,
                  color: done || current ? c.text : c.faint,
                  fontSize: 15,
                  fontFamily: 'Inter_600SemiBold',
                }}
              >
                {label}
              </Text>
            </View>
          );
        })}
      </View>

      <Text style={{ marginTop: 16, textAlign: 'center', color: c.faint, fontSize: 12, fontFamily: 'Inter_400Regular' }}>
        We'll send you an alert when it's done, even if you leave this screen.
      </Text>
    </View>
  );
}

/** A 14 pt ring with one open side, turning once every 0.8 s. */
function Spinner({ colour }: { colour: string }) {
  const r = useSharedValue(0);
  useEffect(() => {
    r.value = withRepeat(withTiming(1, { duration: 800, easing: Easing.linear }), -1);
    return () => cancelAnimation(r);
  }, [r]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value * 360}deg` }] }));
  return (
    <Animated.View
      style={[
        { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: colour, borderTopColor: 'transparent' },
        style,
      ]}
    />
  );
}
