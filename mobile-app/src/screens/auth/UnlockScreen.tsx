import React, { useEffect, useRef, useState } from 'react';
import { Image, Keyboard, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
import { Fingerprint } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { Button, HeartbeatLoader, PulseRing } from '../../components/ds';
import { Tap } from '../../components/ds/Tap';
import { ErrorBox, OnbField, TextButton } from '../../components/onboarding/OnbParts';
import { useThemeColors } from '../../theme/useThemeColors';
import { useAuthStore } from '../../store/useStore';
import { promptBiometric } from '../../lib/deviceAuth';
import { maskedPhone } from '../../lib/onboardingView';
import { SUPPORT_EMAIL } from '../../lib/brand';

const logoLight = require('../../../assets/logo.png');
const logoDark = require('../../../assets/logo-white.png');

/**
 * Unlock (design handoff, screen 4): a returning customer with fingerprint
 * unlock on. "Welcome back", the masked number, the 96 pt fingerprint button;
 * or "Log in with password", which is a real sign-in with Supabase Auth.
 * "Use another account" signs this one out and goes back to Welcome.
 *
 * Also the signed-out "Log in" route (PasswordLogin): the same password form,
 * reached from "Log in with password instead" on the code screen, for when an
 * SMS code can't be had. There it leads back to the code instead of to the
 * fingerprint.
 */
export default function UnlockScreen({ route, navigation }: any) {
  const standalone = route?.name === 'PasswordLogin';
  const c = useThemeColors();
  const { colorScheme } = useColorScheme();
  const user = useAuthStore((s) => s.user);
  const setLocked = useAuthStore((s) => s.setLocked);
  const login = useAuthStore((s) => s.login);
  const logout = useAuthStore((s) => s.logout);
  const prepareFingerprintOffer = useAuthStore((s) => s.prepareFingerprintOffer);

  const [mode, setMode] = useState<'quick' | 'password'>(standalone ? 'password' : 'quick');
  const [unlocking, setUnlocking] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [hint, setHint] = useState('');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [password, setPassword] = useState('');
  const [loginErr, setLoginErr] = useState('');
  const [forgot, setForgot] = useState(false);
  const asked = useRef(false);

  const first = user?.firstName ?? '';

  const unlock = async () => {
    if (unlocking) return;
    setUnlocking(true);
    setHint('');
    const outcome = await promptBiometric('Unlock MiliPay', 'Cancel');
    if (outcome === 'success') {
      setLocked(false);
      return;
    }
    setUnlocking(false);
    if (outcome === 'unavailable') setHint("Fingerprint isn't available. Log in with your password.");
    else if (outcome === 'failed') setHint("That didn't match. Try again.");
  };

  // Ask straight away, as banking apps do; the button is there to try again.
  useEffect(() => {
    if (asked.current || standalone) return;
    asked.current = true;
    void unlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doLogin = async () => {
    Keyboard.dismiss();
    if (!phone.trim() || !password.trim()) {
      setLoginErr('Please enter your phone number and password.');
      return;
    }
    setLoggingIn(true);
    try {
      if (standalone) await prepareFingerprintOffer();
      await login(phone, password);
      // Signed in afresh: the store unlocks.
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setLoginErr(/invalid/i.test(err?.message ?? '') ? 'That phone number and password don\'t match.' : err?.message || 'Could not log you in.');
      setLoggingIn(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flex: 1, paddingTop: 22, paddingHorizontal: 24, paddingBottom: 24 }}>
        <View style={{ alignItems: 'center' }}>
          <Image
            source={colorScheme === 'dark' ? logoDark : logoLight}
            style={{ height: 44, width: 173 }}
            resizeMode="contain"
            accessibilityLabel="MiliPay"
          />
        </View>

        {mode === 'quick' ? (
          <>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: c.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: c.brandText, fontSize: 26, fontFamily: 'Inter_700Bold' }}>{user?.initials ?? ''}</Text>
              </View>
              <Text
                accessibilityRole="header"
                style={{ marginTop: 6, color: c.text, fontSize: 26, fontFamily: 'Inter_800ExtraBold', letterSpacing: -0.52, textAlign: 'center' }}
              >
                {first ? `Welcome back, ${first}` : 'Welcome back'}
              </Text>
              <Text style={{ color: c.muted, fontSize: 15, fontFamily: 'Inter_400Regular' }}>{maskedPhone(user?.phone ?? '')}</Text>
              <Tap
                onPress={unlock}
                accessibilityRole="button"
                accessibilityLabel="Unlock with fingerprint"
                style={{ marginTop: 40, width: 96, height: 96, borderRadius: 48, backgroundColor: c.brandSoft, alignItems: 'center', justifyContent: 'center' }}
              >
                <PulseRing colour={c.brand} />
                <Fingerprint color={c.brand} size={48} strokeWidth={1.6} />
              </Tap>
              <Text accessibilityLiveRegion="polite" style={{ marginTop: 8, color: c.muted, fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center' }}>
                {unlocking ? 'Unlocking…' : hint || 'Touch to unlock'}
              </Text>
            </View>
            <View style={{ gap: 14 }}>
              <Button label="Unlock with fingerprint" icon={Fingerprint} onPress={unlock} />
              <TextButton
                label="Log in with password"
                onPress={() => {
                  setLoginErr('');
                  setMode('password');
                }}
              />
              <Tap onPress={() => void logout()} accessibilityRole="button" style={{ padding: 2, alignItems: 'center' }}>
                <Text style={{ color: c.muted, fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' }}>
                  {first ? `Not ${first}? ` : ''}
                  <Text style={{ color: c.text, fontFamily: 'Inter_600SemiBold' }}>Use another account</Text>
                </Text>
              </Tap>
            </View>
          </>
        ) : (
          <>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', gap: 16 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={{ gap: 6, alignItems: 'center', marginBottom: 10 }}>
                <Text accessibilityRole="header" style={{ color: c.text, fontSize: 28, fontFamily: 'Inter_800ExtraBold', letterSpacing: -0.56 }}>
                  Log in
                </Text>
                <Text style={{ color: c.muted, fontSize: 14, fontFamily: 'Inter_400Regular' }}>Enter your phone number and password</Text>
              </View>
              <ErrorBox message={loginErr} line={1.3} />
              <OnbField
                label="Phone number"
                value={phone}
                onChangeText={(t) => {
                  setPhone(t);
                  setLoginErr('');
                }}
                placeholder="080 0000 0000"
                keyboardType="phone-pad"
                fontSize={16}
              />
              <OnbField
                label="Password"
                labelRight={
                  <Tap onPress={() => setForgot((v) => !v)} accessibilityRole="button" hitSlop={8}>
                    <Text style={{ color: c.brandText, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>Forgot password?</Text>
                  </Tap>
                }
                value={password}
                onChangeText={(t) => {
                  setPassword(t);
                  setLoginErr('');
                }}
                placeholder="Enter password"
                secret
                textContentType="password"
                autoComplete="password"
                fontSize={16}
                onSubmitEditing={doLogin}
              />
              {forgot ? (
                <View style={{ paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: c.chip }}>
                  <Text style={{ color: c.muted, fontSize: 13, lineHeight: 19.5, fontFamily: 'Inter_400Regular' }}>
                    {standalone
                      ? 'You can log in with a code sent to your phone instead. '
                      : `You can log in with a code sent to your phone instead: tap Use another account, then "I've enrolled, log me in". `}
                    If you're stuck, contact {SUPPORT_EMAIL}.
                  </Text>
                </View>
              ) : null}
              <View style={{ marginTop: 6 }}>
                <Button label={loggingIn ? 'Logging in…' : 'Log in'} onPress={doLogin} />
              </View>
              {standalone ? (
                <TextButton label="Log in with a code instead" padding={4} onPress={() => navigation?.goBack()} />
              ) : (
                <TextButton label="Use fingerprint instead" padding={4} onPress={() => setMode('quick')} />
              )}
            </ScrollView>
            <Text style={{ paddingHorizontal: 12, color: c.muted, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular', textAlign: 'center' }}>
              Your password is the one you created when you first logged in to MiliPay.
            </Text>
          </>
        )}
      </View>
      <HeartbeatLoader visible={loggingIn} />
    </SafeAreaView>
  );
}
