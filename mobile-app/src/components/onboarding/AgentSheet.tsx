import React from 'react';
import { Alert, Text, View } from 'react-native';
import { Hand, MapPin, Scan, ShieldCheck, type LucideIcon } from 'lucide-react-native';

import { BottomSheet, Button } from '../ds';
import { useThemeColors, withAlpha } from '../../theme/useThemeColors';
import { ENROL_STEPS } from '../../lib/onboardingView';
import { SUPPORT_EMAIL } from '../../lib/brand';

const ICONS: Record<(typeof ENROL_STEPS)[number]['icon'], LucideIcon> = {
  'map-pin': MapPin,
  hand: Hand,
  'shield-check': ShieldCheck,
  scan: Scan,
};

/**
 * "Upgrade to Tier 2 at an agent" (design handoff, sign-up section): the four
 * steps to add a palm, and "Find an agent near me". Opened from Welcome's
 * "Have a palm? Enrol at an agent", the Tier 1 done screen and the Palm tab.
 */
export function AgentSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const c = useThemeColors();
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Upgrade to Tier 2 at an agent">
      <Text style={{ marginTop: 4, color: c.muted, fontSize: 14, lineHeight: 20.3, fontFamily: 'Inter_400Regular' }}>
        Add your palm to pay at any MiliPay terminal and raise your limits to ₦150,000 per payment and ₦500,000 a day.
      </Text>
      <View style={{ marginTop: 18 }}>
        {ENROL_STEPS.map((e, i) => {
          const Icon = ICONS[e.icon];
          const last = i === ENROL_STEPS.length - 1;
          return (
            <View key={e.title} style={{ flexDirection: 'row', gap: 14 }}>
              <View style={{ alignItems: 'center' }}>
                <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: withAlpha(e.colour, 0.14), alignItems: 'center', justifyContent: 'center' }}>
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
                {!last ? <View style={{ flex: 1, minHeight: 10, marginVertical: 4, borderLeftWidth: 2, borderStyle: 'dashed', borderColor: c.line }} /> : null}
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
            // No agent directory yet (agents have a state on file, no address),
            // so this says so rather than showing a made-up map.
            Alert.alert(
              'Find an agent',
              `We're putting MiliPay agents on a map. Until then, email ${SUPPORT_EMAIL} with your town and we'll point you to the nearest one.`,
            )
          }
        />
      </View>
    </BottomSheet>
  );
}
