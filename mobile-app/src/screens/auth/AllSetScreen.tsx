import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, Hand, Landmark, ShieldCheck } from 'lucide-react-native';

import { Button, Enter, HeartbeatLoader, PulseRing } from '../../components/ds';
import { Tap } from '../../components/ds/Tap';
import { ErrorBox, OnbFrame, TextButton } from '../../components/onboarding/OnbParts';
import { AgentSheet } from '../../components/onboarding/AgentSheet';
import { useThemeColors } from '../../theme/useThemeColors';
import { brandFixed } from '../../theme/tokens';
import { useAuthStore } from '../../store/useStore';
import { allSetCopy, doneRows, palmCardCopy, signupDoneRows } from '../../lib/onboardingView';
import { capsFor } from '../../lib/limitsView';

const naira0 = (n: number) => '₦' + n.toLocaleString('en-NG');

/**
 * "You're all set" (design handoff, screen 3 done; and the sign-up version).
 *
 * Agent-enrolled: the Palm Pay card and checklist, then "Go to home".
 * Self sign-up (Tier 1): the "Basic account · Tier 1" card with its limits,
 * the sign-up checklist, the upgrade card, then "Link your bank account" or
 * "Do this later". Only true rows either way.
 *
 * Every button finishes setup on the server first, which is what lets the
 * app past these screens.
 */
export default function AllSetScreen({ route }: any) {
  const c = useThemeColors();
  const user = useAuthStore((s) => s.user);
  const signup = useAuthStore((s) => s.onboarding?.signupSource === 'self');
  const tier = useAuthStore((s) => s.onboarding?.kycTier ?? s.user?.kycTier ?? 2);
  const completeOnboarding = useAuthStore((s) => s.completeOnboarding);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [agent, setAgent] = useState(false);

  const fingerprint = Boolean(route?.params?.fingerprint);
  const hasPalm = Boolean(user?.hasPalm);
  const copy = allSetCopy(user?.firstName ?? '', hasPalm);
  const palm = palmCardCopy(hasPalm);
  const rows = signup ? signupDoneRows(fingerprint).map((label) => ({ label, value: '' })) : doneRows({ hasPalm, fingerprint });
  const caps = capsFor(tier);

  const finish = async (linkBank: boolean) => {
    if (busy) return;
    setBusy(true);
    setError('');
    if (linkBank) useAuthStore.setState({ linkBankOnArrival: true });
    const done = await completeOnboarding();
    if (!done) {
      useAuthStore.setState({ linkBankOnArrival: false });
      setBusy(false);
      setError("Couldn't finish setting up. Check your connection and try again.");
    }
    // On success the app moves to Home by itself.
  };

  const checklist = rows.map((r) => (
    <View key={r.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: c.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Check color={c.brandText} size={13} strokeWidth={3} />
      </View>
      <Text style={{ flex: 1, color: c.text, fontSize: 14, fontFamily: 'Inter_400Regular' }}>{r.label}</Text>
      {r.value ? <Text style={{ color: c.muted, fontSize: 13, fontFamily: 'Inter_400Regular' }}>{r.value}</Text> : null}
    </View>
  ));

  return (
    <OnbFrame>
      <Enter kind="fade" style={{ flex: 1 }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <Enter kind="pop" duration={500} style={{ marginBottom: 10 }}>
            <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: '#00C896', alignItems: 'center', justifyContent: 'center' }}>
              <Check color={brandFixed.onBrand} size={44} strokeWidth={3} />
            </View>
          </Enter>
          <Text accessibilityRole="header" style={{ color: c.text, fontSize: 28, fontFamily: 'Inter_800ExtraBold', letterSpacing: -0.7, textAlign: 'center' }}>
            {copy.title}
          </Text>
          <Text style={{ maxWidth: 300, color: c.muted, fontSize: 15, lineHeight: 22.5, fontFamily: 'Inter_400Regular', textAlign: 'center' }}>
            {signup ? 'Your MiliPay account is ready.' : copy.sub}
          </Text>
        </View>

        <View
          style={{
            padding: 14,
            borderRadius: 22,
            backgroundColor: c.card,
            borderWidth: 1,
            borderColor: c.cardLine,
            boxShadow: c.shadow,
            gap: 12,
            marginBottom: 12,
          }}
        >
          {signup ? (
            <View style={{ gap: 12, padding: 14, borderRadius: 16, backgroundColor: c.chip }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: c.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <ShieldCheck color={c.brandText} size={21} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: c.text, fontSize: 15, fontFamily: 'Inter_700Bold' }}>Basic account · Tier 1</Text>
                  <Text style={{ marginTop: 2, color: c.muted, fontSize: 12, fontFamily: 'Inter_400Regular' }}>Pay bills and buy airtime and data</Text>
                </View>
                <LinearGradient
                  colors={brandFixed.gold as unknown as [string, string]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{ paddingVertical: 3, paddingHorizontal: 9, borderRadius: 999 }}
                >
                  <Text style={{ color: brandFixed.goldText, fontSize: 11, fontFamily: 'Inter_800ExtraBold' }}>Basic</Text>
                </LinearGradient>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[
                  [naira0(caps.maxSingle), 'per payment'],
                  [naira0(caps.maxDaily), 'a day'],
                ].map(([amount, label]) => (
                  <View key={label} style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: c.card }}>
                    <Text style={{ color: c.text, fontSize: 16, fontFamily: 'Inter_800ExtraBold', fontVariant: ['tabular-nums'] }}>{amount}</Text>
                    <Text style={{ marginTop: 1, color: c.muted, fontSize: 12, fontFamily: 'Inter_400Regular' }}>{label}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <LinearGradient
              colors={['#0A7A5A', '#022C22']}
              start={{ x: 0.25, y: 0.07 }}
              end={{ x: 0.75, y: 0.93 }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, overflow: 'hidden' }}
            >
              <View style={{ position: 'absolute', right: -30, top: -40, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.06)' }} />
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#00C896', alignItems: 'center', justifyContent: 'center' }}>
                <PulseRing colour="#33E0B5" duration={2000} outset={5} active={palm.live} />
                <Hand color={brandFixed.onBrand} size={22} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: '#FFFFFF', fontSize: 15, fontFamily: 'Inter_700Bold' }}>{palm.title}</Text>
                <Text style={{ marginTop: 2, color: 'rgba(255,255,255,0.8)', fontSize: 12, fontFamily: 'Inter_400Regular' }}>{palm.sub}</Text>
              </View>
              {palm.live ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4, paddingHorizontal: 9, borderRadius: 999, backgroundColor: 'rgba(51,224,181,0.18)' }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#33E0B5' }} />
                  <Text style={{ color: '#33E0B5', fontSize: 11, fontFamily: 'Inter_700Bold' }}>Live</Text>
                </View>
              ) : null}
            </LinearGradient>
          )}
          {checklist}
        </View>

        {signup ? (
          <View
            style={{
              flexDirection: 'row',
              gap: 12,
              padding: 14,
              borderRadius: 20,
              backgroundColor: c.card,
              borderWidth: 1,
              borderColor: c.cardLine,
              boxShadow: c.shadow,
              marginBottom: 16,
            }}
          >
            <LinearGradient
              colors={['#0A7A5A', '#022C22']}
              start={{ x: 0.25, y: 0.07 }}
              end={{ x: 0.75, y: 0.93 }}
              style={{ width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }}
            >
              <Hand color="#33E0B5" size={21} />
            </LinearGradient>
            <View style={{ flex: 1, minWidth: 0, alignItems: 'flex-start', gap: 3 }}>
              <Text style={{ color: c.text, fontSize: 14, fontFamily: 'Inter_700Bold' }}>Want palm payments and higher limits?</Text>
              <Text style={{ color: c.muted, fontSize: 13, lineHeight: 18.85, fontFamily: 'Inter_400Regular' }}>
                {`Visit a MiliPay agent to add your palm and move to Tier 2 (${naira0(capsFor(2).maxSingle)} per payment, ${naira0(capsFor(2).maxDaily)} a day).`}
              </Text>
              <Tap onPress={() => setAgent(true)} accessibilityRole="button" hitSlop={8} style={{ marginTop: 4 }}>
                <Text style={{ color: c.brandText, fontSize: 13, fontFamily: 'Inter_700Bold' }}>Find an agent</Text>
              </Tap>
            </View>
          </View>
        ) : null}

        {error ? (
          <View style={{ marginBottom: 12 }}>
            <ErrorBox message={error} />
          </View>
        ) : null}

        {signup ? (
          <View style={{ gap: 4 }}>
            <Button label="Link your bank account" icon={Landmark} onPress={() => finish(true)} />
            <TextButton label="Do this later" tone="muted" padding={12} onPress={() => finish(false)} />
          </View>
        ) : (
          <Button label="Go to home" onPress={() => finish(false)} />
        )}
      </Enter>
      <AgentSheet visible={agent} onClose={() => setAgent(false)} />
      <HeartbeatLoader visible={busy} />
    </OnbFrame>
  );
}
