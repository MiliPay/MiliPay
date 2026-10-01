import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { Check, Hand, Landmark, MapPin, Pause } from 'lucide-react-native';

import { PAGE_PADDING, TabTitle } from '../../components/ds/Layout';
import { Switch } from '../../components/ds';
import { Tap } from '../../components/ds/Tap';
import { LimitsCard } from '../../components/me/LimitsCard';
import { TxDetailSheet } from '../../components/activity/TxDetailSheet';
import { useTxHelp } from '../../components/activity/useTxHelp';
import { useThemeColors } from '../../theme/useThemeColors';
import { brandFixed } from '../../theme/tokens';
import { useAuthStore, useBankStore, usePalmStore, useTransactionStore, type AppTransaction } from '../../store/useStore';
import { bankLabel, txService, whenLabel } from '../../lib/activityView';
import { capsFor } from '../../lib/limitsView';
import { naira2 } from '../../lib/purchaseForm';
import {
  PALM_STEPS,
  enrolledLine,
  nextPalmAccount,
  palmChip,
  palmHeroLine,
  palmStatusTitle,
  palmToday,
} from '../../lib/palmView';

/** The prototype's `beatRing`: .92× → 1.55× while fading .6 → 0 over 60% of 2 s. */
function BeatRing({ active }: { active: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (!active) {
      cancelAnimation(t);
      t.value = 0;
      return;
    }
    t.value = withRepeat(
      withSequence(withTiming(1, { duration: 1200, easing: Easing.out(Easing.ease) }), withTiming(1, { duration: 800 }), withTiming(0, { duration: 0 })),
      -1,
    );
    return () => cancelAnimation(t);
  }, [active, t]);
  const style = useAnimatedStyle(() => ({
    opacity: active ? 0.6 * (1 - t.value) : 1,
    transform: [{ scale: active ? 0.92 + 0.63 * t.value : 1 }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: 38, borderWidth: 2, borderColor: 'rgba(51,224,181,0.55)' }, style]}
    />
  );
}

/**
 * Palm Pay (design handoff, screen 7): where the customer's palm stands, the
 * account palm payments come from, today's palm spending, pausing, their
 * limits, how to pay at a terminal, and where they have paid with their palm.
 *
 * Pause and "pays from" are enforced by process-payment, not just shown here.
 */
export default function PalmScreen({ navigation }: any) {
  const c = useThemeColors();
  const user = useAuthStore((s) => s.user);
  const onboarding = useAuthStore((s) => s.onboarding);
  const palm = usePalmStore((s) => s.palm);
  const fetchPalm = usePalmStore((s) => s.fetchPalm);
  const setPaused = usePalmStore((s) => s.setPaused);
  const setAccount = usePalmStore((s) => s.setAccount);
  const accounts = useBankStore((s) => s.linkedAccounts);
  const fetchAccounts = useBankStore((s) => s.fetchAccounts);
  const transactions = useTransactionStore((s) => s.transactions);
  const fetchTransactions = useTransactionStore((s) => s.fetchTransactions);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const help = useTxHelp(navigation, () => setSelectedId(null));

  useFocusEffect(
    useCallback(() => {
      void fetchPalm();
      if (user?.id) {
        void fetchAccounts(user.id);
        void fetchTransactions(user.id, user.customerId);
      }
    }, [fetchPalm, fetchAccounts, fetchTransactions, user?.id, user?.customerId]),
  );

  const hasPalm = palm?.hasPalm ?? Boolean(user?.hasPalm);
  const paused = palm?.paused ?? false;
  const state = { hasPalm, paused };
  const chip = palmChip(state);
  const chipColours =
    chip.tone === 'warn' ? [c.warnSoft, c.warn] : chip.tone === 'brand' ? [c.brandSoft, c.brandText] : [c.chip, c.muted];

  const tier = onboarding?.kycTier ?? user?.kycTier ?? 2;
  const dailyLimit = onboarding?.dailyLimit ?? capsFor(tier).maxDaily;
  const today = palmToday(palm?.spentToday ?? 0, dailyLimit);
  const enrolled = enrolledLine(palm?.enrolledAt ?? null, palm?.agentName ?? null);

  const palmTx = useMemo(() => transactions.filter((t) => txService(t) === 'palm'), [transactions]);
  const selected = palmTx.find((t) => t.id === selectedId) ?? null;
  const accountLabelFor = (id: string | null | undefined) => {
    const a = accounts.find((x) => x.id === id);
    return a ? bankLabel(a.bankName, a.accountNumber) : null;
  };

  const changeAccount = async () => {
    const next = nextPalmAccount(accounts, palm?.account?.id ?? null);
    if (!next) return;
    const result = await setAccount(next.id);
    if (!result.success) Alert.alert("Couldn't change account", result.error ?? 'Please try again.');
  };

  const togglePause = async () => {
    const result = await setPaused(!paused);
    if (!result.success) Alert.alert("Couldn't change this", result.error ?? 'Please try again.');
  };

  const cardStyle = {
    marginTop: 14,
    marginHorizontal: 20,
    backgroundColor: c.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: c.cardLine,
    boxShadow: c.shadow,
    overflow: 'hidden' as const,
  };
  const iconTile = (Icon: typeof Landmark) => (
    <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: c.chip, alignItems: 'center', justifyContent: 'center' }}>
      <Icon color={c.muted} size={18} />
    </View>
  );
  const divider = <View style={{ height: 1, backgroundColor: c.line, marginHorizontal: 16 }} />;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 28 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={{ paddingTop: 10, paddingHorizontal: PAGE_PADDING, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <TabTitle>Palm Pay</TabTitle>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingVertical: 5,
                paddingHorizontal: 11,
                borderRadius: 999,
                backgroundColor: chipColours[0],
              }}
            >
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: chipColours[1] }} />
              <Text style={{ color: chipColours[1], fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>{chip.label}</Text>
            </View>
          </View>

          {/* Hero */}
          <LinearGradient
            colors={['#065F46', '#022C22']}
            start={{ x: 0.21, y: 0.09 }}
            end={{ x: 0.79, y: 0.91 }}
            style={{ marginTop: 14, marginHorizontal: 20, padding: 18, borderRadius: 26, overflow: 'hidden' }}
          >
            <View style={{ position: 'absolute', right: -80, bottom: -110, width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(255,255,255,0.05)' }} />
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 15, lineHeight: 21.75, fontFamily: 'Inter_400Regular' }}>{palmHeroLine(state)}</Text>
            <View
              style={{
                marginTop: 16,
                padding: 16,
                borderRadius: 20,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 16,
                backgroundColor: 'rgba(255,255,255,0.07)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.1)',
                opacity: paused || !hasPalm ? 0.55 : 1,
              }}
            >
              <View style={{ width: 76, height: 76, alignItems: 'center', justifyContent: 'center' }}>
                <BeatRing active={hasPalm && !paused} />
                <View style={{ position: 'absolute', top: 8, right: 8, bottom: 8, left: 8, borderRadius: 30, backgroundColor: 'rgba(51,224,181,0.14)' }} />
                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#00C896', alignItems: 'center', justifyContent: 'center' }}>
                  <Hand color={brandFixed.onBrand} size={26} />
                </View>
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                <Text style={{ color: '#FFFFFF', fontSize: 16, fontFamily: 'Inter_700Bold' }}>{palmStatusTitle(state)}</Text>
                {hasPalm ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Check color="#33E0B5" size={13} strokeWidth={3} />
                    <Text style={{ color: '#33E0B5', fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>Palm veins captured</Text>
                  </View>
                ) : null}
                {enrolled ? (
                  <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontFamily: 'Inter_400Regular' }}>{enrolled}</Text>
                ) : null}
              </View>
            </View>
          </LinearGradient>

          {/* Pays from · today · pause */}
          <View style={cardStyle}>
            <Tap
              onPress={changeAccount}
              disabled={accounts.length < 2}
              accessibilityRole="button"
              accessibilityLabel={`Palm payments come from ${palm?.account ? `${palm.account.bankName} ending ${palm.account.last4}` : 'no bank yet'}. Change.`}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: pressed ? c.chip : 'transparent' })}
            >
              {iconTile(Landmark)}
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.muted, fontSize: 13, fontFamily: 'Inter_400Regular' }}>Palm payments come from</Text>
                <Text style={{ marginTop: 1, color: c.text, fontSize: 15, fontFamily: 'Inter_600SemiBold' }}>
                  {palm?.account ? `${palm.account.bankName} ••${palm.account.last4}` : 'No bank linked yet'}
                </Text>
              </View>
              {accounts.length >= 2 ? <Text style={{ color: c.brandText, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>Change</Text> : null}
            </Tap>
            {divider}
            <View style={{ paddingVertical: 14, paddingHorizontal: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: c.muted, fontSize: 13, fontFamily: 'Inter_400Regular' }}>Spent by palm today</Text>
                <Text style={{ color: c.text, fontSize: 13, fontFamily: 'Inter_600SemiBold', fontVariant: ['tabular-nums'] }}>{today.label}</Text>
              </View>
              <View style={{ marginTop: 10, height: 8, borderRadius: 4, backgroundColor: c.chip, overflow: 'hidden' }}>
                <View style={{ height: '100%', width: `${today.pct}%`, borderRadius: 4, backgroundColor: c.brand }} />
              </View>
            </View>
            {divider}
            <Tap
              onPress={togglePause}
              accessibilityRole="switch"
              accessibilityState={{ checked: paused }}
              accessibilityLabel="Pause palm payments"
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: pressed ? c.chip : 'transparent' })}
            >
              {iconTile(Pause)}
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontSize: 15, fontFamily: 'Inter_600SemiBold' }}>Pause palm payments</Text>
                <Text style={{ marginTop: 2, color: c.muted, fontSize: 12, lineHeight: 16.2, fontFamily: 'Inter_400Regular' }}>
                  Terminals decline your palm until you turn this off.
                </Text>
              </View>
              <Switch value={paused} onChange={togglePause} label="Pause palm payments" />
            </Tap>
          </View>

          <LimitsCard onTierDetails={() => navigation.navigate('MeTab', { screen: 'AccountLimits', initial: false })} />

          {/* How to pay at a terminal */}
          <Text accessibilityRole="header" style={{ marginTop: 20, marginHorizontal: 20, color: c.text, fontSize: 16, fontFamily: 'Inter_700Bold', letterSpacing: -0.16 }}>
            How to pay at a terminal
          </Text>
          <View style={{ marginTop: 10, marginHorizontal: 20, flexDirection: 'row', gap: 10 }}>
            {PALM_STEPS.map((s) => (
              <View
                key={s.n}
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  paddingHorizontal: 12,
                  backgroundColor: c.card,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: c.cardLine,
                  boxShadow: c.shadow,
                  gap: 8,
                }}
              >
                <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: c.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: c.brandText, fontSize: 13, fontFamily: 'Inter_700Bold' }}>{s.n}</Text>
                </View>
                <Text style={{ color: c.text, fontSize: 13, lineHeight: 17.55, fontFamily: 'Inter_500Medium' }}>{s.text}</Text>
              </View>
            ))}
          </View>

          {/* Where you paid with your palm */}
          <Text accessibilityRole="header" style={{ marginTop: 20, marginHorizontal: 20, color: c.text, fontSize: 16, fontFamily: 'Inter_700Bold', letterSpacing: -0.16 }}>
            Where you paid with your palm
          </Text>
          <View style={{ ...cardStyle, marginTop: 10, paddingVertical: 4 }}>
            {palmTx.length === 0 ? (
              <Text style={{ paddingVertical: 14, paddingHorizontal: 16, color: c.muted, fontSize: 14, fontFamily: 'Inter_400Regular' }}>
                Your palm payments will show here.
              </Text>
            ) : (
              palmTx.slice(0, 10).map((t: AppTransaction) => (
                <Tap
                  key={t.id}
                  onPress={() => setSelectedId(t.id)}
                  accessibilityRole="button"
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    backgroundColor: pressed ? c.chip : 'transparent',
                  })}
                >
                  <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: c.chip, alignItems: 'center', justifyContent: 'center' }}>
                    <MapPin color={c.muted} size={20} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ color: c.text, fontSize: 15, fontFamily: 'Inter_600SemiBold' }}>
                      {t.merchant_name || 'Palm payment'}
                    </Text>
                    <Text numberOfLines={1} style={{ marginTop: 3, color: c.muted, fontSize: 12, fontFamily: 'Inter_400Regular' }}>
                      {`Palm terminal · ${whenLabel(t.created_at)}`}
                    </Text>
                  </View>
                  <Text style={{ color: c.text, fontSize: 15, fontFamily: 'Inter_700Bold', fontVariant: ['tabular-nums'] }}>{'-' + naira2(t.amount)}</Text>
                </Tap>
              ))
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <TxDetailSheet
        tx={selected}
        accountLabel={accountLabelFor(selected?.account_used)}
        onClose={() => setSelectedId(null)}
        onHelp={(tx) => void help(tx)}
      />
    </SafeAreaView>
  );
}
