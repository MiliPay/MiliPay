import React, { useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { CircleHelp } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { Button, CodeBoxes, Enter, HeartbeatLoader, Keypad, PinDots } from '../../components/ds';
import { Tap } from '../../components/ds/Tap';
import { ErrorBox, OnbFrame, OnbHeader, OnbTitle } from '../../components/onboarding/OnbParts';
import { useThemeColors } from '../../theme/useThemeColors';
import { useAuthStore } from '../../store/useStore';
import { LOGIN_PIN_COPY, fmtPhone, phoneDigits, stepOneButton, stepOneCopy } from '../../lib/onboardingView';
import { requestLoginCode, resendLoginCode, submitLoginPin, verifyLoginCode } from '../../lib/loginCode';

type Stage = 'phone' | 'code' | 'pin';

const RESEND_GAP_MS = 30_000;

/**
 * "Log in to MiliPay" (design handoff, screen 3, step 1): the phone number the
 * customer gave their agent, then the 6-digit code sent to it by SMS.
 *
 * A first sign-in goes straight on to creating a password. An account that
 * is already set up also asks for its PIN here, so a code on its own — say,
 * on a swapped SIM — is never enough to get in.
 */
export default function PhoneLoginScreen({ navigation, route }: any) {
  const c = useThemeColors();
  const prepareFingerprintOffer = useAuthStore((s) => s.prepareFingerprintOffer);

  const [stage, setStage] = useState<Stage>('phone');
  // "Log in instead" from sign-up arrives with the number already typed.
  const [phone, setPhone] = useState(phoneDigits(String(route?.params?.phone ?? '')));
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [requestId, setRequestId] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState(0);
  const [resent, setResent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(0);
  const verifying = useRef(false);

  const fail = (message: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    setError(message);
    setShake((n) => n + 1);
  };

  /** The code can't be used any more: back to the number, to ask again. */
  const restart = (message: string) => {
    setStage('phone');
    setCode('');
    setPin('');
    setRequestId(null);
    setError(message);
  };

  const sendCode = async () => {
    if (phone.length !== 11) return setError('Enter the 11-digit number you registered with.');
    setBusy(true);
    const result = await requestLoginCode(phone);
    setBusy(false);
    if (!result.ok) return fail(result.message);
    setRequestId(result.requestId);
    setSentTo(result.sentTo || null);
    setSentAt(Date.now());
    setCode('');
    setError('');
    setStage('code');
  };

  const verify = async (value: string) => {
    if (!requestId || verifying.current) return;
    if (value.length !== 6) return setError('Enter all 6 digits of the code.');
    verifying.current = true;
    setBusy(true);
    await prepareFingerprintOffer();
    const result = await verifyLoginCode(requestId, value);
    verifying.current = false;
    if (result.ok && result.step === 'session') return; // signed in: the app moves on
    setBusy(false);
    if (result.ok) {
      setError('');
      setStage('pin');
      return;
    }
    if (result.closed) return restart(result.message);
    setCode('');
    fail(result.message);
  };

  const onCode = (value: string) => {
    setCode(value);
    setError('');
    if (value.length === 6) void verify(value);
  };

  const resend = async () => {
    if (!requestId || busy) return;
    if (Date.now() - sentAt < RESEND_GAP_MS) return setError('Wait a few seconds before asking for another code.');
    setBusy(true);
    const result = await resendLoginCode(requestId);
    setBusy(false);
    if (!result.ok) return result.closed ? restart(result.message) : setError(result.message);
    setSentAt(Date.now());
    setCode('');
    setError('');
    setResent(true);
  };

  useEffect(() => {
    if (!resent) return;
    const t = setTimeout(() => setResent(false), 2000);
    return () => clearTimeout(t);
  }, [resent]);

  const onPinDigit = (d: string) => {
    if (busy || pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    setError('');
    if (next.length < 4 || !requestId) return;
    setTimeout(async () => {
      setBusy(true);
      const result = await submitLoginPin(requestId, next);
      if (result.ok) return; // signed in
      setBusy(false);
      setPin('');
      if (result.closed && !result.locked) return restart(result.message);
      fail(result.message);
    }, 220);
  };

  const back = () => {
    if (stage === 'phone') return navigation.goBack();
    // From the code or the PIN: back to the number (the prototype's changeNumber).
    setStage('phone');
    setCode('');
    setPin('');
    setRequestId(null);
    setError('');
  };

  const copy = stage === 'pin' ? LOGIN_PIN_COPY : stepOneCopy(stage === 'code', sentTo);
  const ready = stage === 'code' ? code.length === 6 : phone.length === 11;

  return (
    <OnbFrame>
      <OnbHeader onBack={back} />
      {stage === 'pin' ? (
        <Enter kind="screenIn" key="pin" style={{ flex: 1, marginTop: 22 }}>
          <OnbTitle title={copy.title} sub={copy.sub} />
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
            <PinDots filled={pin.length} error={!!error} shakeKey={shake} />
            <Text style={{ minHeight: 18, color: c.fail, fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' }}>{error}</Text>
          </View>
          <Keypad onDigit={onPinDigit} onDelete={() => setPin((p) => p.slice(0, -1))} disabled={busy} />
        </Enter>
      ) : (
        <Enter kind="screenIn" key={stage} style={{ flex: 1, marginTop: 22, gap: 16 }}>
          <OnbTitle title={copy.title} sub={copy.sub} />
          <ErrorBox message={error} />
          {stage === 'phone' ? (
            <>
              <View style={{ gap: 8 }}>
                <Text style={{ color: c.muted, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>Phone number</Text>
                <View
                  style={{
                    height: 56,
                    borderRadius: 16,
                    backgroundColor: c.card,
                    borderWidth: 1.5,
                    borderColor: c.line,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    paddingHorizontal: 16,
                  }}
                >
                  <View style={{ paddingRight: 10, borderRightWidth: 1, borderRightColor: c.line }}>
                    <Text style={{ color: c.muted, fontSize: 15, fontFamily: 'Inter_600SemiBold' }}>+234</Text>
                  </View>
                  <TextInput
                    value={fmtPhone(phone)}
                    onChangeText={(t) => {
                      setPhone(phoneDigits(t));
                      setError('');
                    }}
                    keyboardType="phone-pad"
                    textContentType="telephoneNumber"
                    autoComplete="tel"
                    placeholder="0803 000 0000"
                    placeholderTextColor={c.faint}
                    accessibilityLabel="Phone number"
                    autoFocus
                    onSubmitEditing={sendCode}
                    style={{ flex: 1, height: '100%', color: c.text, fontSize: 17, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.51 }}
                  />
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: c.chip }}>
                <View style={{ paddingTop: 1 }}>
                  <CircleHelp color={c.muted} size={16} />
                </View>
                <Text style={{ flex: 1, color: c.muted, fontSize: 13, lineHeight: 18.85, fontFamily: 'Inter_400Regular' }}>
                  Use the number you gave your agent. If you haven't had a verification message by email, SMS or WhatsApp yet, your account is still
                  being checked.
                </Text>
              </View>
              {/* Not in the design: a way in when an SMS code can't be had
                  (no signal, codes not configured yet). */}
              <Tap onPress={() => navigation.navigate('PasswordLogin')} accessibilityRole="button" hitSlop={8} style={{ alignSelf: 'center' }}>
                <Text style={{ color: c.brandText, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>Log in with password instead</Text>
              </Tap>
            </>
          ) : (
            <>
              <CodeBoxes value={code} onChange={onCode} error={!!error} shakeKey={shake} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Tap onPress={back} accessibilityRole="button" hitSlop={8}>
                  <Text style={{ color: c.muted, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>Change number</Text>
                </Tap>
                <Tap onPress={resend} accessibilityRole="button" hitSlop={8}>
                  <Text style={{ color: c.brandText, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>{resent ? 'Code sent' : 'Resend code'}</Text>
                </Tap>
              </View>
            </>
          )}
          <View style={{ flex: 1 }} />
          <Button
            label={stepOneButton(stage === 'code', busy)}
            disabled={!ready}
            onPress={stage === 'phone' ? sendCode : () => verify(code)}
          />
        </Enter>
      )}
      <HeartbeatLoader visible={busy} />
    </OnbFrame>
  );
}
