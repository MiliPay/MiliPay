import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, Hand } from 'lucide-react-native';

import { Button, Enter, HeartbeatLoader, PulseRing } from '../../components/ds';
import { ErrorBox, OnbFrame } from '../../components/onboarding/OnbParts';
import { useThemeColors } from '../../theme/useThemeColors';
import { brandFixed } from '../../theme/tokens';
import { useAuthStore } from '../../store/useStore';
import { allSetCopy, doneRows, palmCardCopy } from '../../lib/onboardingView';

/**
 * "You're all set" (design handoff, screen 3, done): the Palm Pay card and a
 * checklist of what is now in place. Only true rows: the palm card says
 * "not set up yet" when no palm is on file, and the fingerprint row shows only
 * when it was turned on. "Go to home" finishes setup on the server, which is
 * what lets the app past these screens.
 */
export default function AllSetScreen({ route }: any) {
  const c = useThemeColors();
  const user = useAuthStore((s) => s.user);
  const completeOnboarding = useAuthStore((s) => s.completeOnboarding);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const hasPalm = Boolean(user?.hasPalm);
  const copy = allSetCopy(user?.firstName ?? '', hasPalm);
  const palm = palmCardCopy(hasPalm);
  const rows = doneRows({ hasPalm, fingerprint: Boolean(route?.params?.fingerprint) });

  const finish = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    const done = await completeOnboarding();
    if (!done) {
      setBusy(false);
      setError("Couldn't finish setting up. Check your connection and try again.");
    }
    // On success the app moves to Home by itself.
  };

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
            {copy.sub}
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
            marginBottom: 16,
          }}
        >
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
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  paddingVertical: 4,
                  paddingHorizontal: 9,
                  borderRadius: 999,
                  backgroundColor: 'rgba(51,224,181,0.18)',
                }}
              >
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#33E0B5' }} />
                <Text style={{ color: '#33E0B5', fontSize: 11, fontFamily: 'Inter_700Bold' }}>Live</Text>
              </View>
            ) : null}
          </LinearGradient>
          {rows.map((r) => (
            <View key={r.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: c.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Check color={c.brandText} size={13} strokeWidth={3} />
              </View>
              <Text style={{ flex: 1, color: c.text, fontSize: 14, fontFamily: 'Inter_400Regular' }}>{r.label}</Text>
              {r.value ? <Text style={{ color: c.muted, fontSize: 13, fontFamily: 'Inter_400Regular' }}>{r.value}</Text> : null}
            </View>
          ))}
        </View>
        {error ? (
          <View style={{ marginBottom: 12 }}>
            <ErrorBox message={error} />
          </View>
        ) : null}
        <Button label="Go to home" onPress={finish} />
      </Enter>
      <HeartbeatLoader visible={busy} />
    </OnbFrame>
  );
}
