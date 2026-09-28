import React, { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { AlertTriangle, Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { HeartbeatLoader, PressScale } from '../ds';
import { DoneSheet } from './DoneSheet';
import { useAuthStore } from '../../store/useStore';
import { useThemeColors } from '../../theme/useThemeColors';
import { brandFixed } from '../../theme/tokens';
import { amountText, capsFor, limitsError, parseAmount } from '../../lib/limitsView';

const naira0 = (n: number) => '₦' + Math.round(n).toLocaleString('en-NG');

/**
 * "Your limits" (design handoff, the Palm tab): the customer's own per-payment
 * and daily limits, below their tier's ceiling. Payments over them are
 * declined by the server, which clamps them again on save
 * (set_transaction_limits) — nothing typed here can raise a cap.
 */
export function LimitsCard({ onTierDetails }: { onTierDetails: () => void }) {
  const c = useThemeColors();
  const user = useAuthStore((s) => s.user);
  const onboarding = useAuthStore((s) => s.onboarding);
  const setTransactionLimits = useAuthStore((s) => s.setTransactionLimits);

  const tier = onboarding?.kycTier ?? user?.kycTier ?? 2;
  const caps = capsFor(tier);
  const savedSingle = onboarding?.singleLimit ?? caps.maxSingle;
  const savedDaily = onboarding?.dailyLimit ?? caps.maxDaily;

  const [singleText, setSingleText] = useState(amountText(savedSingle));
  const [dailyText, setDailyText] = useState(amountText(savedDaily));
  useEffect(() => setSingleText(amountText(savedSingle)), [savedSingle]);
  useEffect(() => setDailyText(amountText(savedDaily)), [savedDaily]);

  const sv = parseAmount(singleText);
  const dv = parseAmount(dailyText);
  const modified = sv !== savedSingle || dv !== savedDaily;
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ single: number; daily: number; pin: number } | null>(null);

  const save = async () => {
    if (!modified || saving) return;
    const problem = limitsError(sv, dv, tier);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    const result = await setTransactionLimits(sv, dv);
    setSaving(false);
    if (!result.success || !result.limits) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setError(result.error || "Couldn't save your limits. Please try again.");
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    // What the server actually kept, which is what applies.
    setSaved({ single: result.limits.singleLimit, daily: result.limits.dailyLimit, pin: result.limits.pinThreshold });
  };

  const fields = [
    { label: 'Per payment', text: singleText, value: sv, cap: caps.maxSingle, set: setSingleText },
    { label: 'Daily limit', text: dailyText, value: dv, cap: caps.maxDaily, set: setDailyText },
  ];

  return (
    <View>
      <View style={{ marginTop: 20, marginHorizontal: 20, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text accessibilityRole="header" style={{ color: c.text, fontSize: 16, fontFamily: 'Inter_700Bold', letterSpacing: -0.16 }}>
          Your limits
        </Text>
        <Pressable onPress={onTierDetails} hitSlop={8} accessibilityRole="button">
          <Text style={{ color: c.brandText, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>Tier {tier} details</Text>
        </Pressable>
      </View>
      <Text style={{ marginTop: 4, marginHorizontal: 20, color: c.muted, fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular' }}>
        Set your own limits below your Tier {tier} ceiling. Payments over them are declined.
      </Text>
      <View style={{ marginTop: 10, marginHorizontal: 20, padding: 16, gap: 16, backgroundColor: c.card, borderRadius: 20, borderWidth: 1, borderColor: c.cardLine, boxShadow: c.shadow }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[
            ['Daily limit', savedDaily],
            ['Per payment', savedSingle],
          ].map(([label, value]) => (
            <View key={String(label)} style={{ flex: 1, padding: 12, borderRadius: 16, backgroundColor: c.brandSoft }}>
              <Text style={{ color: c.brandText, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>{label}</Text>
              <Text style={{ marginTop: 2, color: c.text, fontSize: 17, fontFamily: 'Inter_800ExtraBold', fontVariant: ['tabular-nums'] }}>
                {naira0(Number(value))}
              </Text>
            </View>
          ))}
        </View>

        {fields.map((f) => {
          const over = f.value > f.cap;
          return (
            <View key={f.label} style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Text style={{ color: c.text, fontSize: 14, fontFamily: 'Inter_600SemiBold' }}>{f.label}</Text>
                <Text style={{ color: c.muted, fontSize: 12, fontFamily: 'Inter_400Regular' }}>Tier {tier} max {naira0(f.cap)}</Text>
              </View>
              <View
                style={{
                  height: 54,
                  borderRadius: 14,
                  backgroundColor: c.input,
                  borderWidth: 1.5,
                  borderColor: over ? c.fail : c.line,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 14,
                }}
              >
                <Text style={{ color: c.muted, fontSize: 17, fontFamily: 'Inter_700Bold' }}>₦</Text>
                <TextInput
                  value={f.text}
                  onChangeText={(t) => {
                    setError('');
                    f.set(amountText(parseAmount(t.slice(0, 11))));
                  }}
                  keyboardType="number-pad"
                  accessibilityLabel={f.label}
                  style={{ flex: 1, height: '100%', color: c.text, fontSize: 17, fontFamily: 'Inter_700Bold', fontVariant: ['tabular-nums'] }}
                />
                <Pressable
                  onPress={() => {
                    setError('');
                    f.set(amountText(f.cap));
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${f.label}: use the maximum`}
                  style={{ paddingVertical: 5, paddingHorizontal: 10, borderRadius: 8, backgroundColor: c.chip }}
                >
                  <Text style={{ color: c.brandText, fontSize: 12, fontFamily: 'Inter_700Bold' }}>Max</Text>
                </Pressable>
              </View>
              <View style={{ height: 4, borderRadius: 2, backgroundColor: c.chip, overflow: 'hidden' }}>
                <View style={{ height: '100%', borderRadius: 2, backgroundColor: over ? c.fail : c.brand, width: `${Math.min(100, (f.value / f.cap) * 100)}%` }} />
              </View>
            </View>
          );
        })}

        {error ? (
          <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: c.failSoft }}>
            <AlertTriangle color={c.fail} size={15} />
            <Text style={{ flex: 1, color: c.fail, fontSize: 13, lineHeight: 18, fontFamily: 'Inter_400Regular' }}>{error}</Text>
          </View>
        ) : null}

        <PressScale
          onPress={() => void save()}
          disabled={!modified}
          accessibilityRole="button"
          accessibilityState={{ disabled: !modified }}
          style={{
            height: 52,
            borderRadius: 14,
            backgroundColor: c.brand,
            opacity: modified ? 1 : 0.4,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <Check color={brandFixed.onBrand} size={18} strokeWidth={2.5} />
          <Text style={{ color: brandFixed.onBrand, fontSize: 15, fontFamily: 'Inter_700Bold' }}>Save limits</Text>
        </PressScale>
      </View>

      <HeartbeatLoader visible={saving} />
      <DoneSheet
        visible={saved !== null}
        title="Changes saved"
        sub="Your new limits apply to your next payment."
        rows={
          saved
            ? [
                { k: 'Per payment', v: naira0(saved.single) },
                { k: 'Daily limit', v: naira0(saved.daily) },
                { k: 'PIN required over', v: naira0(saved.pin) },
              ]
            : []
        }
        onClose={() => setSaved(null)}
      />
    </View>
  );
}
