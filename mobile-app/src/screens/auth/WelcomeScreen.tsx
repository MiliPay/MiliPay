import React, { useState } from 'react';
import { Alert, Image, Text, View } from 'react-native';
import { Hand, MapPin, ShieldCheck, Smartphone, type LucideIcon } from 'lucide-react-native';

import { BottomSheet, Button, Enter, PulseRing } from '../../components/ds';
import { OnbFrame, TextButton } from '../../components/onboarding/OnbParts';
import { useThemeColors, withAlpha } from '../../theme/useThemeColors';
import { ENROL_STEPS } from '../../lib/onboardingView';
import { SUPPORT_EMAIL } from '../../lib/brand';

const MARK = require('../../../assets/splash-mark.png');

const ICONS: Record<(typeof ENROL_STEPS)[number]['icon'], LucideIcon> = {
  'map-pin': MapPin,
  hand: Hand,
  'shield-check': ShieldCheck,
  smartphone: Smartphone,
};

/**
 * Welcome (design handoff, screen 3): the logo tile, "MiliPay", and the two
 * ways in — "I've enrolled, log me in" to sign in by SMS code, or "Not yet
 * enrolled" for how registration works.
 */
export default function WelcomeScreen({ navigation }: any) {
  const c = useThemeColors();
  const [enrol, setEnrol] = useState(false);

  const logIn = () => {
    setEnrol(false);
    navigation.navigate('PhoneLogin');
  };

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
        <Button label="I've enrolled, log me in" onPress={logIn} />
        <Button label="Not yet enrolled" variant="outline" onPress={() => setEnrol(true)} />
      </Enter>

      <BottomSheet visible={enrol} onClose={() => setEnrol(false)} title="Get registered in 4 steps">
        <Text style={{ marginTop: 4, color: c.muted, fontSize: 14, lineHeight: 20.3, fontFamily: 'Inter_400Regular' }}>
          You register in person with a MiliPay agent, so your palm is linked to you.
        </Text>
        <View style={{ marginTop: 18 }}>
          {ENROL_STEPS.map((e, i) => {
            const Icon = ICONS[e.icon];
            const last = i === ENROL_STEPS.length - 1;
            return (
              <View key={e.title} style={{ flexDirection: 'row', gap: 14 }}>
                <View style={{ alignItems: 'center' }}>
                  <View
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 14,
                      backgroundColor: withAlpha(e.colour, 0.14),
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon color={e.colour} size={20} />
                    <View
                      style={{
                        position: 'absolute',
                        top: -5,
                        right: -5,
                        width: 18,
                        height: 18,
                        borderRadius: 9,
                        backgroundColor: e.colour,
                        borderWidth: 2,
                        borderColor: c.sheet,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ color: '#FFFFFF', fontSize: 10, fontFamily: 'Inter_800ExtraBold', lineHeight: 12 }}>{i + 1}</Text>
                    </View>
                  </View>
                  {!last ? (
                    <View style={{ flex: 1, minHeight: 10, marginVertical: 4, borderLeftWidth: 2, borderStyle: 'dashed', borderColor: c.line }} />
                  ) : null}
                </View>
                <View style={{ flex: 1, paddingTop: 2, paddingBottom: 14 }}>
                  <Text style={{ color: c.text, fontSize: 15, fontFamily: 'Inter_700Bold' }}>{e.title}</Text>
                  <Text style={{ marginTop: 3, color: c.muted, fontSize: 13, lineHeight: 18.2, fontFamily: 'Inter_400Regular' }}>{e.body}</Text>
                </View>
              </View>
            );
          })}
        </View>
        <View style={{ marginTop: 4 }}>
          <Button
            label="Find an agent near me"
            icon={MapPin}
            onPress={() =>
              // There is no agent directory yet (agents have a state on file,
              // no address), so this says so rather than showing a made-up map.
              Alert.alert(
                'Find an agent',
                `We're putting MiliPay agents on a map. Until then, email ${SUPPORT_EMAIL} with your town and we'll point you to the nearest one.`,
              )
            }
          />
        </View>
        <View style={{ paddingTop: 6 }}>
          <TextButton label="My account is verified, log me in" onPress={logIn} />
        </View>
      </BottomSheet>
    </OnbFrame>
  );
}
