import React, { useCallback, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Hand } from 'lucide-react-native';

import { Button, Enter, PulseRing } from '../../components/ds';
import { Tap } from '../../components/ds/Tap';
import { OnbFrame } from '../../components/onboarding/OnbParts';
import { AgentSheet } from '../../components/onboarding/AgentSheet';
import { useThemeColors } from '../../theme/useThemeColors';
import { abandonSignup, loadSavedSignup, saveSignup, signupStatus, type SavedSignup } from '../../lib/signupClient';
import { barFilled } from '../../lib/signupView';

const MARK = require('../../../assets/splash-mark.png');

/**
 * Welcome (design handoff, "Self sign-up" screen 1): the logo tile, then
 * "Create an account" and "I already have an account", and "Have a palm?
 * Enrol at an agent".
 *
 * A sign-up left half-way (its session kept on the server, the key to it in
 * SecureStore) shows "Pick up where you left off — Step N of 5" with
 * "Continue signing up" and "Start again".
 */
export default function WelcomeScreen({ navigation }: any) {
  const c = useThemeColors();
  const [agent, setAgent] = useState(false);
  const [resume, setResume] = useState<{ saved: SavedSignup; step: number } | null>(null);

  // Read whenever Welcome shows: "Save & exit" lands back here.
  useFocusEffect(
    useCallback(() => {
      let live = true;
      (async () => {
        const saved = await loadSavedSignup();
        if (!saved) return live && setResume(null);
        const status = await signupStatus(saved);
        if (!live) return;
        if (status.ok && ['nin', 'selfie', 'confirm', 'addr'].includes(status.view.step)) {
          setResume({ saved, step: status.view.stepNumber });
        } else {
          // In review: kept (it comes back once a person decides), but there is
          // nothing to continue yet. Finished, rejected or gone: forgotten.
          // A dropped connection is not a reason to forget it.
          const gone = status.ok
            ? status.view.step === 'done' || status.view.step === 'abandoned'
            : ['NOT_FOUND', 'BAD_TOKEN', 'EXPIRED', 'ABANDONED', 'DONE'].includes(status.code ?? '');
          if (gone) await saveSignup(null);
          setResume(null);
        }
      })();
      return () => {
        live = false;
      };
    }, []),
  );

  const logIn = () => navigation.navigate('PhoneLogin');

  return (
    <OnbFrame>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 }}>
        <Enter kind="pop" duration={600}>
          <View
            style={{
              width: 132,
              height: 132,
              borderRadius: 38,
              backgroundColor: '#FFFFFF',
              borderWidth: 1,
              borderColor: c.cardLine,
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0px 20px 44px -18px rgba(6, 95, 70, 0.55)',
            }}
          >
            <PulseRing colour={c.brandSoft} duration={2200} delay={400} outset={10} radius={46} />
            <Image source={MARK} style={{ width: 116, height: 116 }} resizeMode="contain" accessibilityLabel="MiliPay" />
          </View>
        </Enter>
        <Enter kind="rise" delay={200} style={{ alignItems: 'center', gap: 6 }}>
          <Text accessibilityRole="header" style={{ color: c.text, fontSize: 36, fontFamily: 'Inter_800ExtraBold', letterSpacing: -1.26 }}>
            MiliPay
          </Text>
          <Text style={{ color: c.muted, fontSize: 15, fontFamily: 'Inter_400Regular' }}>Payments in milliseconds</Text>
        </Enter>
      </View>

      <Enter kind="rise" delay={350} style={{ gap: 10 }}>
        {resume ? (
          <>
            <View
              style={{
                paddingVertical: 14,
                paddingHorizontal: 16,
                borderRadius: 16,
                backgroundColor: c.card,
                borderWidth: 1,
                borderColor: c.cardLine,
                boxShadow: c.shadow,
                gap: 10,
                marginBottom: 4,
              }}
            >
              <Text style={{ color: c.text, fontSize: 14, fontFamily: 'Inter_600SemiBold' }}>
                {`Pick up where you left off — Step ${resume.step} of 5`}
              </Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {barFilled(resume.step - 1).map((on, i) => (
                  <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: on ? c.brand : c.line }} />
                ))}
              </View>
            </View>
            <Button label="Continue signing up" onPress={() => navigation.navigate('Signup', { resume: true })} />
            <Button label="I already have an account" variant="outline" onPress={logIn} />
            <Tap
              onPress={async () => {
                await abandonSignup(resume.saved);
                setResume(null);
                navigation.navigate('Signup', {});
              }}
              accessibilityRole="button"
              style={{ paddingTop: 6, alignItems: 'center' }}
            >
              <Text style={{ color: c.muted, fontSize: 14, fontFamily: 'Inter_600SemiBold' }}>Start again</Text>
            </Tap>
          </>
        ) : (
          <>
            <Button label="Create an account" onPress={() => navigation.navigate('Signup', {})} />
            <Button label="I already have an account" variant="outline" onPress={logIn} />
          </>
        )}
        <Tap
          onPress={() => setAgent(true)}
          accessibilityRole="button"
          hitSlop={6}
          style={{ paddingTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          <Hand color={c.brandText} size={16} />
          <Text style={{ color: c.brandText, fontSize: 14, fontFamily: 'Inter_600SemiBold' }}>Have a palm? Enrol at an agent</Text>
        </Tap>
      </Enter>

      <AgentSheet visible={agent} onClose={() => setAgent(false)} />
    </OnbFrame>
  );
}
