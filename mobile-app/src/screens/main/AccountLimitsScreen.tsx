import React, { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { AlertTriangle, Check, Hand, Lock, ShieldCheck } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { HeartbeatLoader, PressScale, ScreenHeader } from '../../components/ds';
import { DoneSheet } from '../../components/me/DoneSheet';
import { useAuthStore } from '../../store/useStore';
import { useThemeColors } from '../../theme/useThemeColors';
import { brandFixed } from '../../theme/tokens';
import { supabase } from '../../lib/supabase';
import {
  PIN_PRESETS,
  TIER_CAPS,
  TIER_INFO,
  amountText,
  capsFor,
  parseAmount,
  pinCeiling,
  spentToday,
  tierStatus,
} from '../../lib/limitsView';

const naira0 = (n: number) => '₦' + Math.round(n).toLocaleString('en-NG');

/**
 * Account limits (design handoff, screen 12): your tier with today's
 * spending against your daily limit, the PIN-at-terminals threshold, and the
 * account tiers. The per-payment and daily limits themselves are set on the
 * Palm tab ("Your limits"), as in the design.
 *
 * "Spent today" is the server's own figure (get_my_daily_spend), the same one
 * that enforces the daily cap — not a sum the app works out for itself.
 */
export default function AccountLimitsScreen({ navigation }: any) {
  const c = useThemeColors();
  const user = useAuthStore((s) => s.user);
  const onboarding = useAuthStore((s) => s.onboarding);
  const updatePinThreshold = useAuthStore((s) => s.updatePinThreshold);

  const tier = onboarding?.kycTier ?? user?.kycTier ?? 2;
  const info = TIER_INFO[tier] ?? TIER_INFO[2];
  const caps = capsFor(tier);
  const daily = onboarding?.dailyLimit ?? caps.maxDaily;
  const single = onboarding?.singleLimit ?? caps.maxSingle;
  const savedThreshold = user?.pinThreshold ?? onboarding?.pinThreshold ?? 10000;

  const [used, setUsed] = useState<number | null>(null);
  const loadUsed = useCallback(() => {
    supabase.rpc('get_my_daily_spend').then(({ data, error }) => {
      if (!error) setUsed(Number(data) || 0);
    });
  }, []);
  useFocusEffect(loadUsed);

  const [pinText, setPinText] = useState(amountText(savedThreshold));
  useEffect(() => setPinText(amountText(savedThreshold)), [savedThreshold]);
  const pv = parseAmount(pinText);
  const ceiling = pinCeiling(tier, single);
  const pinOver = pv > ceiling;
  const pinMod = pv !== savedThreshold && pv > 0 && !pinOver;

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<number | null>(null);
  const [saveError, setSaveError] = useState('');

  const savePin = async () => {
    if (!pinMod || saving) return;
    setSaving(true);
    setSaveError('');
    const ok = await updatePinThreshold(pv);
    setSaving(false);
    if (!ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setSaveError("Couldn't save your PIN amount. Check your connection and try again.");
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setSaved(pv);
  };

  const bar = spentToday(used ?? 0, daily);
  const shown = pv || savedThreshold;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScreenHeader title="Account limits" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <LinearGradient
            colors={brandFixed.heroGradient as unknown as [string, string, string]}
            locations={brandFixed.heroGradientStops as unknown as [number, number, number]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ marginTop: 16, marginHorizontal: 20, padding: 20, borderRadius: 26, overflow: 'hidden', boxShadow: '0px 14px 30px -14px rgba(6, 95, 70, 0.7)' }}
          >
            <View style={{ position: 'absolute', right: -70, top: -90, width: 230, height: 230, borderRadius: 115, backgroundColor: 'rgba(255,255,255,0.06)' }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ color: '#FFFFFF', fontSize: 22, fontFamily: 'Inter_800ExtraBold', letterSpacing: -0.44 }}>Tier {tier}</Text>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(51,224,181,0.18)' }}>
                    <Text style={{ color: '#33E0B5', fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.8, textTransform: 'uppercase' }}>{info.badge}</Text>
                  </View>
                </View>
                <Text style={{ marginTop: 3, color: 'rgba(255,255,255,0.75)', fontSize: 13, fontFamily: 'Inter_400Regular' }}>{info.confirmed}</Text>
              </View>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }}>
                <ShieldCheck color="#33E0B5" size={20} />
              </View>
            </View>
            <View style={{ marginTop: 18 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, fontFamily: 'Inter_400Regular' }}>Spent today</Text>
                <Text style={{ color: '#FFFFFF', fontSize: 13, fontFamily: 'Inter_600SemiBold', fontVariant: ['tabular-nums'] }}>
                  {used === null ? '…' : bar.usedLabel}
                </Text>
              </View>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.14)', marginTop: 8, overflow: 'hidden' }}>
                <View style={{ height: '100%', borderRadius: 4, backgroundColor: '#33E0B5', width: `${bar.fraction * 100}%` }} />
              </View>
              <Text style={{ marginTop: 6, color: 'rgba(255,255,255,0.7)', fontSize: 12, fontFamily: 'Inter_400Regular' }}>
                {used === null ? ' ' : bar.leftLabel}
              </Text>
            </View>
          </LinearGradient>

          <Text accessibilityRole="header" style={{ marginTop: 20, marginHorizontal: 20, color: c.text, fontSize: 16, fontFamily: 'Inter_700Bold', letterSpacing: -0.16 }}>
            PIN at terminals
          </Text>
          <Text style={{ marginTop: 4, marginHorizontal: 20, color: c.muted, fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular' }}>
            Payments above this amount need your 4-digit PIN at a MiliPay terminal. Below it, your palm alone approves.
          </Text>
          <View style={{ marginTop: 10, marginHorizontal: 20, padding: 16, gap: 12, backgroundColor: c.card, borderRadius: 20, borderWidth: 1, borderColor: c.cardLine, boxShadow: c.shadow }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1, padding: 12, borderRadius: 14, backgroundColor: c.brandSoft }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Hand color={c.brandText} size={14} />
                  <Text style={{ color: c.brandText, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>Palm only</Text>
                </View>
                <Text style={{ marginTop: 4, color: c.text, fontSize: 15, fontFamily: 'Inter_800ExtraBold', fontVariant: ['tabular-nums'] }}>Up to {naira0(shown)}</Text>
              </View>
              <View style={{ flex: 1, padding: 12, borderRadius: 14, backgroundColor: c.chip }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Lock color={c.muted} size={14} />
                  <Text style={{ color: c.muted, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>Palm + PIN</Text>
                </View>
                <Text style={{ marginTop: 4, color: c.text, fontSize: 15, fontFamily: 'Inter_800ExtraBold', fontVariant: ['tabular-nums'] }}>Above {naira0(shown)}</Text>
              </View>
            </View>

            <View
              style={{
                height: 54,
                borderRadius: 14,
                backgroundColor: c.input,
                borderWidth: 1.5,
                borderColor: pinOver ? c.warn : c.line,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 14,
              }}
            >
              <Text style={{ color: c.muted, fontSize: 17, fontFamily: 'Inter_700Bold' }}>₦</Text>
              <TextInput
                value={pinText}
                onChangeText={(t) => {
                  setSaveError('');
                  setPinText(amountText(parseAmount(t.slice(0, 11))));
                }}
                keyboardType="number-pad"
                accessibilityLabel="PIN required above"
                style={{ flex: 1, height: '100%', color: c.text, fontSize: 17, fontFamily: 'Inter_700Bold', fontVariant: ['tabular-nums'] }}
              />
            </View>
            {pinOver ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <AlertTriangle color={c.warn} size={13} />
                <Text style={{ flex: 1, color: c.warn, fontSize: 12, fontFamily: 'Inter_400Regular' }}>
                  Can't be more than your per-payment limit of {naira0(ceiling)}
                </Text>
              </View>
            ) : null}

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {PIN_PRESETS.map((v) => {
                const on = pv === v;
                const disabled = v > ceiling;
                return (
                  <Pressable
                    key={v}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setSaveError('');
                      setPinText(amountText(v));
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={{
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                      borderRadius: 12,
                      borderWidth: 1.5,
                      borderColor: on ? '#00C896' : c.line,
                      backgroundColor: on ? '#00C896' : c.input,
                    }}
                  >
                    <Text style={{ color: on ? brandFixed.onBrand : disabled ? c.faint : c.text, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>
                      {naira0(v)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {saveError ? <Text style={{ color: c.fail, fontSize: 13, fontFamily: 'Inter_400Regular' }}>{saveError}</Text> : null}

            <PressScale
              onPress={() => void savePin()}
              disabled={!pinMod}
              accessibilityRole="button"
              accessibilityState={{ disabled: !pinMod }}
              style={{
                height: 52,
                borderRadius: 14,
                backgroundColor: c.brand,
                opacity: pinMod ? 1 : 0.4,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <Check color={brandFixed.onBrand} size={18} strokeWidth={2.5} />
              <Text style={{ color: brandFixed.onBrand, fontSize: 15, fontFamily: 'Inter_700Bold' }}>
                {pinMod ? `Save · PIN over ${naira0(pv)}` : 'Save changes'}
              </Text>
            </PressScale>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Lock color={c.faint} size={12} />
              <Text style={{ color: c.faint, fontSize: 12, fontFamily: 'Inter_400Regular' }}>Takes effect immediately on all MiliPay terminals</Text>
            </View>
          </View>

          <Text accessibilityRole="header" style={{ marginTop: 20, marginHorizontal: 20, color: c.text, fontSize: 16, fontFamily: 'Inter_700Bold', letterSpacing: -0.16 }}>
            Account tiers
          </Text>
          <View style={{ marginTop: 10, marginHorizontal: 20, gap: 10 }}>
            {[1, 2, 3].map((n) => {
              const status = tierStatus(n, tier);
              const current = status === 'Current';
              const soon = status === 'Coming soon';
              return (
                <View
                  key={n}
                  style={{
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    backgroundColor: c.card,
                    borderRadius: 18,
                    borderWidth: current ? 2 : 1,
                    borderColor: current ? c.brand : c.cardLine,
                    boxShadow: c.shadow,
                    opacity: soon ? 0.75 : 1,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: current ? '#00C896' : c.chip, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: current ? brandFixed.onBrand : c.muted, fontSize: 14, fontFamily: 'Inter_800ExtraBold' }}>{n}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: c.text, fontSize: 15, fontFamily: 'Inter_700Bold' }}>{TIER_INFO[n].name}</Text>
                      <Text style={{ marginTop: 2, color: c.muted, fontSize: 12, fontFamily: 'Inter_400Regular' }}>{TIER_INFO[n].needs}</Text>
                    </View>
                    <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: current ? c.brandSoft : c.chip }}>
                      <Text style={{ color: current ? c.brandText : c.muted, fontSize: 11, fontFamily: 'Inter_700Bold' }}>{status}</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 18, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.line }}>
                    <Text style={{ color: c.muted, fontSize: 13, fontFamily: 'Inter_400Regular' }}>
                      Daily <Text style={{ color: c.text, fontFamily: 'Inter_700Bold' }}>{naira0(TIER_CAPS[n].maxDaily)}</Text>
                    </Text>
                    <Text style={{ color: c.muted, fontSize: 13, fontFamily: 'Inter_400Regular' }}>
                      Per payment <Text style={{ color: c.text, fontFamily: 'Inter_700Bold' }}>{naira0(TIER_CAPS[n].maxSingle)}</Text>
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <HeartbeatLoader visible={saving} />
      <DoneSheet
        visible={saved !== null}
        title="Changes saved"
        sub="Your terminals are updated."
        rows={
          saved !== null
            ? [
                { k: 'Palm only', v: `Up to ${naira0(saved)}` },
                { k: 'Palm + PIN', v: `Above ${naira0(saved)}` },
                { k: 'Status', v: 'Active on all terminals' },
              ]
            : []
        }
        onClose={() => setSaved(null)}
      />
    </SafeAreaView>
  );
}
