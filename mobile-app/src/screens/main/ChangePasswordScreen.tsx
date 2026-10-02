import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, ChevronLeft, Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react-native';

import { Button, CodeBoxes, HeartbeatLoader, IconButton } from '../../components/ds';
import { Tap } from '../../components/ds/Tap';
import { useThemeColors } from '../../theme/useThemeColors';
import { brandFixed } from '../../theme/tokens';
import { useAuthStore } from '../../store/useStore';
import { changePasswordRules, changePasswordStrength, resetPhoneDisplay } from '../../lib/onboardingView';
import { changePassword, requestReset, resendReset, resetPassword, verifyReset } from '../../lib/passwordClient';

type Step = 'form' | 'phone' | 'otp';

/**
 * Me › Security › Change password (design handoff, screen 9b).
 *
 * Normal: current, new, confirm, the 4-part bar and the checklist; a wrong
 * current password is said in red under the fields. "Forgot your current
 * password?" turns the same screen into "Reset password": the number on the
 * account, a 6-digit SMS code, then a new password with no current one.
 * Either way every other session is signed out, and Me shows "Password
 * updated".
 */
export default function ChangePasswordScreen({ navigation }: any) {
  const c = useThemeColors();
  const user = useAuthStore((s) => s.user);

  const [step, setStep] = useState<Step>('form');
  const [reset, setReset] = useState<{ requestId: string; token: string } | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [shown, setShown] = useState(false);
  const [phone, setPhone] = useState(resetPhoneDisplay(user?.phone ?? ''));
  const [otp, setOtp] = useState('');
  const [resent, setResent] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(0);
  const [busy, setBusy] = useState(false);

  const verified = !!reset;
  const rules = changePasswordRules(current, next, again, verified);
  const strength = changePasswordStrength(next);
  const formOk = (verified || current.length >= 1) && rules.every((r) => r.ok);
  const phoneDigits = phone.replace(/\D/g, '').replace(/^0/, '');
  const phoneOk = /^[789][01]\d{8}$/.test(phoneDigits);
  const sentTo = `+234 ${phoneDigits.slice(0, 3)} ${phoneDigits.slice(3, 6)} ${phoneDigits.slice(6)}`;

  const header = step !== 'form' || verified ? 'Reset password' : 'Change password';
  const title = step === 'phone' ? 'Forgot your password?' : step === 'otp' ? 'Enter the code' : verified ? 'Set a new password' : 'Change your password';
  const sub =
    step === 'phone'
      ? "Enter the phone number on your account. We'll send a 6-digit code by SMS."
      : step === 'otp'
      ? `We sent a 6-digit code to ${sentTo}.`
      : verified
      ? "Your number is verified, so you don't need your current password."
      : 'You use it to log in on a new phone. Your PIN and palm stay the same.';
  const mainLabel = step === 'phone' ? 'Send code' : step === 'otp' ? 'Verify code' : 'Update password';
  const mainReady = step === 'phone' ? phoneOk : step === 'otp' ? otp.length === 6 : formOk;

  const done = () => navigation.navigate('SettingsScreen', { passwordUpdated: Date.now() });

  const save = async () => {
    if (!formOk || busy) return;
    setBusy(true);
    setError('');
    const r = reset ? await resetPassword(reset.requestId, reset.token, next) : await changePassword(current, next);
    setBusy(false);
    if (!r.ok) return setError(r.message);
    done();
  };

  const sendCode = async () => {
    if (!phoneOk) return setError('Enter the 10 digits after +234.');
    setBusy(true);
    setError('');
    const r = await requestReset(phoneDigits);
    setBusy(false);
    if (!r.ok) return setError(r.message);
    setRequestId(r.requestId);
    setOtp('');
    setResent(false);
    setStep('otp');
  };

  const verify = async (value = otp) => {
    if (value.length !== 6 || !requestId || busy) return;
    setBusy(true);
    const r = await verifyReset(requestId, value);
    setBusy(false);
    if (!r.ok) {
      setOtp('');
      setShake((n) => n + 1);
      return setError(r.message);
    }
    setReset({ requestId, token: r.resetToken });
    setNext('');
    setAgain('');
    setError('');
    setStep('form');
  };

  const main = step === 'phone' ? sendCode : step === 'otp' ? () => verify() : save;

  const back = () => {
    if (step === 'otp') return setStep('phone');
    if (step === 'phone') return setStep('form');
    navigation.goBack();
  };

  const eye = (
    <Tap onPress={() => setShown((v) => !v)} accessibilityRole="button" accessibilityLabel={shown ? 'Hide passwords' : 'Show passwords'} hitSlop={10}>
      {shown ? <EyeOff color={c.muted} size={18} /> : <Eye color={c.muted} size={18} />}
    </Tap>
  );

  const field = (label: string, value: string, set: (v: string) => void, placeholder: string, bad = false, extra?: React.ReactNode) => (
    <View style={{ gap: 6 }}>
      <Text style={{ color: c.muted, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>{label}</Text>
      <View
        style={{
          minHeight: 56,
          borderRadius: 16,
          backgroundColor: c.input,
          borderWidth: 1.5,
          borderColor: bad ? c.fail : c.line,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 14,
        }}
      >
        <Lock color={c.text} size={18} />
        <TextInput
          value={value}
          onChangeText={(t) => {
            set(t);
            setError('');
          }}
          secureTextEntry={!shown}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={placeholder}
          placeholderTextColor={c.faint}
          accessibilityLabel={label}
          style={{ flex: 1, alignSelf: 'stretch', color: c.text, fontSize: 16, fontFamily: 'Inter_400Regular' }}
        />
        {eye}
      </View>
      {extra}
    </View>
  );

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center' }}>
            <IconButton icon={ChevronLeft} label="Back" onPress={back} />
            <Text accessibilityRole="header" style={{ flex: 1, textAlign: 'center', color: c.text, fontSize: 17, fontFamily: 'Inter_700Bold' }}>
              {header}
            </Text>
            <View style={{ width: 42 }} />
          </View>

          <View style={{ marginTop: 24, alignItems: 'center', gap: 6 }}>
            <View style={{ width: 56, height: 56, borderRadius: 18, marginBottom: 8, backgroundColor: c.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
              <ShieldCheck color={c.brandText} size={26} />
            </View>
            <Text style={{ color: c.text, fontSize: 24, fontFamily: 'Inter_800ExtraBold', letterSpacing: -0.6, textAlign: 'center' }}>{title}</Text>
            <Text style={{ maxWidth: 300, color: c.muted, fontSize: 14, lineHeight: 21, fontFamily: 'Inter_400Regular', textAlign: 'center' }}>{sub}</Text>
          </View>

          {step === 'phone' ? (
            <View style={{ marginTop: 24, gap: 6 }}>
              <Text style={{ color: c.muted, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>Phone number</Text>
              <View
                style={{
                  minHeight: 56,
                  borderRadius: 16,
                  backgroundColor: c.input,
                  borderWidth: 1.5,
                  borderColor: error ? c.fail : c.line,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingHorizontal: 14,
                }}
              >
                <Text style={{ color: c.muted, fontSize: 16, fontFamily: 'Inter_600SemiBold' }}>+234</Text>
                <View style={{ width: 1, height: 22, backgroundColor: c.line }} />
                <TextInput
                  value={phone}
                  onChangeText={(t) => {
                    setPhone(t.replace(/[^0-9 ]/g, '').slice(0, 13));
                    setError('');
                  }}
                  keyboardType="phone-pad"
                  placeholder="803 123 4567"
                  placeholderTextColor={c.faint}
                  accessibilityLabel="Phone number"
                  style={{ flex: 1, alignSelf: 'stretch', color: c.text, fontSize: 16, fontFamily: 'Inter_400Regular' }}
                />
              </View>
              <Text accessibilityLiveRegion="polite" style={{ marginTop: 4, minHeight: 18, color: c.fail, fontSize: 13, fontFamily: 'Inter_400Regular' }}>
                {error}
              </Text>
            </View>
          ) : null}

          {step === 'otp' ? (
            <View style={{ marginTop: 24 }}>
              <CodeBoxes
                value={otp}
                onChange={(v) => {
                  setOtp(v);
                  setError('');
                  if (v.length === 6) void verify(v);
                }}
                tone="input"
                error={!!error}
                shakeKey={shake}
              />
              <Text accessibilityLiveRegion="polite" style={{ marginTop: 10, minHeight: 18, color: c.fail, fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' }}>
                {error}
              </Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Tap onPress={() => setStep('phone')} accessibilityRole="button" hitSlop={8}>
                  <Text style={{ color: c.brandText, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>Change number</Text>
                </Tap>
                <Tap
                  onPress={async () => {
                    if (!requestId) return;
                    const r = await resendReset(requestId);
                    if (!r.ok) return setError(r.message);
                    setOtp('');
                    setError('');
                    setResent(true);
                  }}
                  accessibilityRole="button"
                  hitSlop={8}
                >
                  <Text style={{ color: resent ? c.muted : c.brandText, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>
                    {resent ? 'Code sent again' : 'Resend code'}
                  </Text>
                </Tap>
              </View>
            </View>
          ) : null}

          {step === 'form' ? (
            <View style={{ marginTop: 24, gap: 14 }}>
              {verified ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: c.brandSoft }}>
                  <Check color={c.brandText} size={15} strokeWidth={3} />
                  <Text style={{ color: c.brandText, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>{`Number verified · ${sentTo}`}</Text>
                </View>
              ) : (
                field('Current password', current, setCurrent, 'Enter current password', !!error)
              )}
              {field(
                'New password',
                next,
                setNext,
                'At least 8 characters',
                false,
                <View style={{ flexDirection: 'row', gap: 4, marginTop: 4 }}>
                  {[0, 1, 2, 3].map((i) => (
                    <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i < strength.segments ? strength.colour : c.line }} />
                  ))}
                </View>,
              )}
              {field('Confirm new password', again, setAgain, 'Type it again', !!again && next !== again)}
              <View style={{ gap: 8, padding: 2 }}>
                {rules.map((r) => (
                  <View key={r.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        borderWidth: 1.5,
                        borderColor: r.ok ? '#00C896' : c.line,
                        backgroundColor: r.ok ? '#00C896' : 'transparent',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {r.ok ? <Check color={brandFixed.onBrand} size={12} strokeWidth={3} /> : null}
                    </View>
                    <Text style={{ color: r.ok ? c.text : c.muted, fontSize: 14, fontFamily: 'Inter_400Regular' }}>{r.label}</Text>
                  </View>
                ))}
              </View>
              <Text accessibilityLiveRegion="polite" style={{ minHeight: 18, color: c.fail, fontSize: 13, fontFamily: 'Inter_400Regular' }}>
                {error}
              </Text>
            </View>
          ) : null}

          <View style={{ flex: 1, minHeight: 16 }} />
          <Button label={mainLabel} disabled={!mainReady} onPress={main} />
          {step === 'form' && !verified ? (
            <Tap
              onPress={() => {
                setError('');
                setStep('phone');
              }}
              accessibilityRole="button"
              style={{ marginTop: 14, alignItems: 'center', padding: 4 }}
            >
              <Text style={{ color: c.brandText, fontSize: 14, fontFamily: 'Inter_600SemiBold' }}>Forgot your current password?</Text>
            </Tap>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
      <HeartbeatLoader visible={busy} />
    </SafeAreaView>
  );
}
