import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Lock } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { HeartbeatLoader, Keypad, PinDots, ScreenHeader } from '../../components/ds';
import { useAuthStore } from '../../store/useStore';
import { useThemeColors } from '../../theme/useThemeColors';

/**
 * Change PIN (design handoff, screen 11). The customer has already confirmed
 * it is them (fingerprint, or their current PIN) on the Me tab; here they
 * choose four new digits and enter them again. Saved by set_customer_pin,
 * which also refuses the easy ones (1234, 0000…) in its own words. Back on
 * Me, a "PIN changed" sheet — and the database has written the security
 * alert it mentions.
 */
export default function ChangePinScreen({ navigation }: any) {
  const c = useThemeColors();
  const setPin = useAuthStore((s) => s.setPin);
  const [step, setStep] = useState<1 | 2>(1);
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [error, setError] = useState('');
  const [bad, setBad] = useState(false);
  const [shake, setShake] = useState(0);
  const [saving, setSaving] = useState(false);

  const current = step === 2 ? second : first;

  const reject = (message: string, backToStart = false) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    setError(message);
    setBad(true);
    setShake((n) => n + 1);
    setTimeout(() => {
      setBad(false);
      setSecond('');
      if (backToStart) {
        setFirst('');
        setStep(1);
      }
    }, 500);
  };

  const save = async (pin: string) => {
    setSaving(true);
    const result = await setPin(pin);
    setSaving(false);
    if (!result.success) {
      reject(result.error || "Couldn't save your PIN. Please try again.", true);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    navigation.navigate('SettingsScreen', { pinChanged: Date.now() });
  };

  const onDigit = (d: string) => {
    if (bad || saving || current.length >= 4) return;
    const next = current + d;
    setError('');
    if (step === 1) {
      setFirst(next);
      if (next.length === 4) setTimeout(() => { setStep(2); setSecond(''); }, 300);
      return;
    }
    setSecond(next);
    if (next.length < 4) return;
    if (next !== first) {
      setTimeout(() => reject('PINs did not match. Try again.'), 150);
      return;
    }
    setTimeout(() => void save(next), 150);
  };

  const onDelete = () => {
    if (bad || saving) return;
    if (step === 2 && !second) {
      setStep(1);
      setFirst('');
      setError('');
      return;
    }
    if (step === 2) setSecond((p) => p.slice(0, -1));
    else setFirst((p) => p.slice(0, -1));
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScreenHeader title="Change PIN" onBack={() => navigation.goBack()} inset={24} />
      <View style={{ flex: 1, paddingHorizontal: 24, paddingBottom: 24 }}>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 18 }}>
          {[1, 2].map((i) => (
            <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: step >= i ? c.brand : c.line }} />
          ))}
        </View>

        <View style={{ alignItems: 'center', gap: 6, marginTop: 28 }}>
          <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: c.brandSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
            <Lock color={c.brandText} size={26} />
          </View>
          <Text accessibilityRole="header" style={{ color: c.text, fontSize: 26, fontFamily: 'Inter_800ExtraBold', letterSpacing: -0.65 }}>
            {step === 2 ? 'Confirm new PIN' : 'Enter a new PIN'}
          </Text>
          <Text style={{ maxWidth: 290, color: c.muted, fontSize: 14, lineHeight: 21, fontFamily: 'Inter_400Regular', textAlign: 'center' }}>
            {step === 2 ? 'Enter your new 4-digit PIN again.' : 'Choose 4 digits for approving payments. Avoid your birthday or 1234.'}
          </Text>
        </View>

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
          <View
            style={{
              paddingVertical: 18,
              paddingHorizontal: 26,
              borderRadius: 999,
              backgroundColor: c.card,
              borderWidth: 1,
              borderColor: c.cardLine,
              boxShadow: c.shadow,
            }}
          >
            <PinDots filled={current.length} error={bad} shakeKey={shake} />
          </View>
          <Text accessibilityLiveRegion="assertive" style={{ minHeight: 18, color: c.fail, fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' }}>
            {error}
          </Text>
        </View>

        <Keypad keyTone="card" onDigit={onDigit} onDelete={onDelete} disabled={saving} />
      </View>
      <HeartbeatLoader visible={saving} />
    </SafeAreaView>
  );
}
