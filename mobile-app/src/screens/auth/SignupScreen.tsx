import React, { useEffect, useRef, useState } from 'react';
import { Image, ScrollView, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Ellipse } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import {
  Calendar,
  Camera,
  Check,
  ChevronDown,
  Clock,
  Glasses,
  IdCard,
  Info,
  RotateCcw,
  ScanFace,
  ShieldCheck,
  Smartphone,
  Sun,
  type LucideIcon,
} from 'lucide-react-native';

import { Button, CodeBoxes, Enter, HeartbeatLoader } from '../../components/ds';
import { Tap } from '../../components/ds/Tap';
import { ErrorBox, OnbFrame, OnbTitle, SignupHeader, TextButton } from '../../components/onboarding/OnbParts';
import { DobSheet, LgaSheet, NinDataSheet, NotMeSheet, SelfieWhySheet, StateSheet } from '../../components/signup/SignupSheets';
import { useThemeColors } from '../../theme/useThemeColors';
import { brandFixed } from '../../theme/tokens';
import { useAuthStore } from '../../store/useStore';
import { fmtPhone, phoneDigits } from '../../lib/onboardingView';
import {
  PHONE_RE,
  SELFIE_TIPS,
  SU_BACK,
  SU_STEP,
  addressReady,
  dobFromIso,
  dobIso,
  dobLabel,
  fmtNin,
  initialsOf,
  ninDigits,
  ninReady,
  triesLeft,
  type Dob,
  type SignupStage,
} from '../../lib/signupView';
import {
  confirmPerson,
  loadSavedSignup,
  resendSignupCode,
  saveSignup,
  selfieStatus,
  signInNewAccount,
  signupStatus,
  smileSession,
  startSignup,
  submitAddress,
  submitNin,
  submitSelfieJob,
  verifySignupPhone,
  type SavedSignup,
  type SignupPerson,
  type SignupView,
} from '../../lib/signupClient';
import { captureSelfie } from '../../lib/smileSelfie';

const TIP_ICONS: Record<string, LucideIcon> = { sun: Sun, glasses: Glasses, smartphone: Smartphone };
const POLL_MS = 2000;
const POLL_LIMIT = 30; // about a minute for Smile ID's verdict

/**
 * Self sign-up, steps 1–4 (design handoff, "Self sign-up (Tier 1)"): phone →
 * code → NIN and date of birth → selfie → "Is this you?" → address. Step 5
 * (password, PIN, fingerprint) is the setup every new account goes through,
 * once the account exists and the customer is signed in.
 *
 * The server holds the progress; this screen only draws the current step.
 * "Save & exit" leaves it there, and Welcome offers to pick it up again.
 */
export default function SignupScreen({ navigation, route }: any) {
  const c = useThemeColors();

  const [stage, setStage] = useState<SignupStage>('phone');
  const [saved, setSaved] = useState<SavedSignup | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loginInstead, setLoginInstead] = useState(false);
  const [shake, setShake] = useState(0);

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [resent, setResent] = useState(false);
  const [nin, setNin] = useState('');
  const [dob, setDob] = useState<Dob | null>(null);
  const [consent, setConsent] = useState(false);
  const [person, setPerson] = useState<SignupPerson | null>(null);
  const [failText, setFailText] = useState('');
  const [attemptsLeft, setAttemptsLeft] = useState(3);
  const [state, setState] = useState('');
  const [lga, setLga] = useState('');
  const [street, setStreet] = useState('');
  const [landmark, setLandmark] = useState('');
  const [sheet, setSheet] = useState<'dob' | 'state' | 'lga' | 'ninData' | 'selfieWhy' | 'notMe' | null>(null);
  const live = useRef(true);
  useEffect(() => () => void (live.current = false), []);

  const clearError = () => {
    setError('');
    setLoginInstead(false);
  };
  const fail = (message: string, login = false) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    setError(message);
    setLoginInstead(login);
    setShake((n) => n + 1);
  };
  const go = (next: SignupStage) => {
    clearError();
    setStage(next);
  };

  /** Draw whatever step the server says this sign-up is on. */
  const apply = (v: SignupView) => {
    setAttemptsLeft(v.selfie?.attemptsLeft ?? 3);
    if (v.dateOfBirth) setDob(dobFromIso(v.dateOfBirth));
    if (v.person) setPerson(v.person);
    if (v.step === 'review') {
      void saveSignup(null);
      return go('review');
    }
    if (v.step === 'confirm') return go('confirm');
    if (v.step === 'addr') return go('addr');
    if (v.step === 'selfie') {
      if (v.selfie?.failure) {
        setFailText(v.selfie.failureText ?? '');
        return go('selfieFail');
      }
      return go('selfie');
    }
    if (v.step === 'nin') return go('nin');
  };

  // "Continue signing up" from Welcome.
  useEffect(() => {
    if (!route?.params?.resume) return;
    (async () => {
      setBusy(true);
      const s = await loadSavedSignup();
      const status = s ? await signupStatus(s) : null;
      if (!live.current) return;
      setBusy(false);
      if (!s || !status || !status.ok) {
        await saveSignup(null);
        setError(status && !status.ok ? status.message : '');
        return;
      }
      setSaved(s);
      setPhone(status.view.phone);
      apply(status.view);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const back = () => {
    const prev = SU_BACK[stage];
    if (!prev) return navigation.goBack();
    setCode('');
    go(prev);
  };

  const saveAndExit = () => navigation.goBack();

  const toLogin = () => navigation.navigate('PhoneLogin', { phone });

  // ─── Phone and code ───────────────────────────────────────────────────────

  const sendCode = async () => {
    if (!PHONE_RE.test(phone) || busy) return;
    setBusy(true);
    const r = await startSignup(phone);
    setBusy(false);
    if (!r.ok) return fail(r.message, r.loginInstead);
    setSessionId(r.sessionId);
    setCode('');
    go('code');
  };

  const onCode = async (value: string) => {
    setCode(value);
    clearError();
    if (value.length < 6 || !sessionId) return;
    setBusy(true);
    const r = await verifySignupPhone(sessionId, value);
    setBusy(false);
    if (!r.ok) {
      setCode('');
      if (r.code === 'PHONE_TAKEN') {
        go('phone');
        return fail(r.message, true);
      }
      return fail(r.message);
    }
    setSaved(r.saved);
    go('nin');
  };

  const resend = async () => {
    if (!sessionId || busy) return;
    const r = await resendSignupCode(sessionId);
    if (!r.ok) return setError(r.message);
    setCode('');
    clearError();
    setResent(true);
    setTimeout(() => live.current && setResent(false), 2000);
  };

  // ─── NIN ──────────────────────────────────────────────────────────────────

  const checkNin = async () => {
    if (nin.length > 0 && nin.length < 11) return fail('Enter all 11 digits of your NIN.');
    if (!ninReady(nin, dob, consent) || !saved || busy) return;
    setBusy(true);
    const r = await submitNin(saved, nin, dobIso(dob!));
    setBusy(false);
    if (!r.ok) return fail(r.message, r.loginInstead);
    go('selfie');
  };

  // ─── Selfie ───────────────────────────────────────────────────────────────

  const waitForVerdict = async (s: SavedSignup, first: SignupView) => {
    let view = first;
    for (let i = 0; view.step === 'selfie' && view.pending && i < POLL_LIMIT; i++) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      if (!live.current) return;
      const r = await selfieStatus(s);
      if (!r.ok) return fail(r.message);
      view = r.view;
    }
    if (view.step === 'selfie' && view.pending) {
      // Smile ID is slow today: the verdict will be applied when they come back.
      return fail("We're still checking your selfie. Give it a minute, then tap Start to see the result.");
    }
    apply(view);
  };

  const startSelfie = async () => {
    if (!saved || busy) return;
    clearError();
    setBusy(true);
    const token = await smileSession(saved);
    if (!token.ok) {
      setBusy(false);
      return fail(token.message);
    }
    const captured = await captureSelfie(token.session);
    if (captured.kind === 'cancelled') return setBusy(false);
    if (captured.kind === 'failed') {
      setBusy(false);
      return fail(captured.message);
    }
    const submitted = await submitSelfieJob(saved, captured.jobId);
    if (!submitted.ok) {
      setBusy(false);
      return fail(submitted.message);
    }
    await waitForVerdict(saved, submitted.view);
    if (live.current) setBusy(false);
  };

  // ─── Is this you? and address ─────────────────────────────────────────────

  const confirmYes = async () => {
    if (!saved || busy) return;
    setBusy(true);
    const r = await confirmPerson(saved);
    setBusy(false);
    if (!r.ok) return fail(r.message);
    go('addr');
  };

  const finish = async () => {
    if (!saved || busy || !addressReady(state, lga, street)) return;
    setBusy(true);
    const r = await submitAddress(saved, { state, lga, street, landmark });
    if (!r.ok) {
      setBusy(false);
      return fail(r.message, r.loginInstead);
    }
    await saveSignup(null);
    // Step 5 offers fingerprint itself; no second offer after it.
    useAuthStore.setState({ offerFingerprint: false });
    if (r.tokenHash && (await signInNewAccount(r.tokenHash))) return; // the app moves on to step 5
    setBusy(false);
    navigation.navigate('PhoneLogin', { phone });
  };

  // ─── Drawing ──────────────────────────────────────────────────────────────

  const errorBox = (
    <ErrorBox message={error} icon action={loginInstead ? { label: 'Log in instead', onPress: toLogin } : undefined} />
  );

  const fieldBox = {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: c.card,
    borderWidth: 1.5,
    borderColor: c.line,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingHorizontal: 16,
  };
  const label = (text: string, extra?: string) => (
    <Text style={{ color: c.muted, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>
      {text}
      {extra ? <Text style={{ color: c.faint, fontFamily: 'Inter_500Medium' }}>{`  ${extra}`}</Text> : null}
    </Text>
  );

  const body = (() => {
    switch (stage) {
      case 'phone':
        return (
          <>
            <OnbTitle title="Create your MiliPay account" sub="Start with your phone number. We'll text you a code." />
            {errorBox}
            <View style={{ gap: 8 }}>
              {label('Phone number')}
              <View style={{ ...fieldBox, borderColor: error ? c.fail : c.line }}>
                <View style={{ paddingRight: 10, borderRightWidth: 1, borderRightColor: c.line }}>
                  <Text style={{ color: c.muted, fontSize: 15, fontFamily: 'Inter_600SemiBold' }}>+234</Text>
                </View>
                <TextInput
                  value={fmtPhone(phone)}
                  onChangeText={(t) => {
                    setPhone(phoneDigits(t));
                    clearError();
                  }}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  placeholder="0803 000 0000"
                  placeholderTextColor={c.faint}
                  accessibilityLabel="Phone number"
                  autoFocus
                  onSubmitEditing={sendCode}
                  style={{ flex: 1, alignSelf: 'stretch', color: c.text, fontSize: 17, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.51 }}
                />
              </View>
            </View>
            <View style={{ flex: 1 }} />
            <Button label="Send code" disabled={!PHONE_RE.test(phone)} onPress={sendCode} />
          </>
        );

      case 'code':
        return (
          <>
            <OnbTitle title="Enter the code" sub={`We sent a 6-digit code by SMS to +234 ${fmtPhone(phone).replace(/^0/, '')}.`} />
            {errorBox}
            <CodeBoxes value={code} onChange={onCode} error={!!error} shakeKey={shake} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Tap onPress={() => go('phone')} accessibilityRole="button" hitSlop={8}>
                <Text style={{ color: c.muted, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>Change number</Text>
              </Tap>
              <Tap onPress={resend} accessibilityRole="button" hitSlop={8}>
                <Text style={{ color: c.brandText, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>{resent ? 'Code sent' : 'Resend code'}</Text>
              </Tap>
            </View>
          </>
        );

      case 'nin':
        return (
          <>
            <OnbTitle
              title="Verify your identity"
              sub="Enter your NIN and date of birth. Next, we'll take a quick selfie to confirm it's you."
            />
            {errorBox}
            <View style={{ gap: 8 }}>
              {label('NIN')}
              <View style={fieldBox}>
                <IdCard color={c.faint} size={20} />
                <TextInput
                  value={fmtNin(nin)}
                  onChangeText={(t) => {
                    setNin(ninDigits(t));
                    clearError();
                  }}
                  keyboardType="number-pad"
                  placeholder="0000 000 0000"
                  placeholderTextColor={c.faint}
                  accessibilityLabel="NIN, 11 digits"
                  style={{ flex: 1, alignSelf: 'stretch', color: c.text, fontSize: 17, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.02 }}
                />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Info color={c.muted} size={13} />
                <Text style={{ color: c.muted, fontSize: 12, fontFamily: 'Inter_400Regular' }}>Dial *346# to get your NIN</Text>
              </View>
            </View>
            <View style={{ gap: 8 }}>
              {label('Date of birth')}
              <Tap onPress={() => setSheet('dob')} accessibilityRole="button" accessibilityLabel={`Date of birth, ${dobLabel(dob)}`} style={fieldBox}>
                <Calendar color={c.faint} size={20} />
                <Text style={{ flex: 1, color: dob ? c.text : c.faint, fontSize: 16, fontFamily: 'Inter_400Regular' }}>{dobLabel(dob)}</Text>
                <ChevronDown color={c.faint} size={18} />
              </Tap>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingTop: 2, paddingHorizontal: 2 }}>
              <Tap
                onPress={() => {
                  setConsent((v) => !v);
                  clearError();
                }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: consent }}
                accessibilityLabel="I agree to the NIN and selfie check"
                hitSlop={10}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 7,
                  borderWidth: 1.5,
                  borderColor: consent ? c.brand : c.faint,
                  backgroundColor: consent ? c.brand : c.card,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {consent ? <Check color={brandFixed.onBrand} size={14} strokeWidth={3} /> : null}
              </Tap>
              <View style={{ flex: 1, alignItems: 'flex-start', gap: 6 }}>
                <Text onPress={() => setConsent((v) => !v)} style={{ color: c.text, fontSize: 14, lineHeight: 20.3, fontFamily: 'Inter_400Regular' }}>
                  I agree that MiliPay can check my NIN and selfie with NIMC through our partner Smile ID to verify who I am.
                </Text>
                <Tap onPress={() => setSheet('ninData')} accessibilityRole="button" hitSlop={8}>
                  <Text style={{ color: c.brandText, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>How we use your data</Text>
                </Tap>
              </View>
            </View>
            <View style={{ flex: 1 }} />
            <Button label="Continue" disabled={!ninReady(nin, dob, consent)} onPress={checkNin} />
          </>
        );

      case 'selfie':
        return (
          <>
            <View style={{ alignItems: 'center', gap: 6, marginTop: 4 }}>
              <View style={{ width: 128, height: 156, marginBottom: 14, alignItems: 'center', justifyContent: 'center' }}>
                <Svg width={128} height={156} style={{ position: 'absolute' }}>
                  <Ellipse cx={64} cy={78} rx={62.75} ry={76.75} stroke={c.brand} strokeWidth={2.5} strokeDasharray="7 5" fill="none" />
                  <Ellipse cx={64} cy={78} rx={52} ry={66} fill={c.brandSoft} />
                </Svg>
                <ScanFace color={c.brandText} size={60} strokeWidth={1.5} />
              </View>
              <Text accessibilityRole="header" style={{ color: c.text, fontSize: 28, fontFamily: 'Inter_800ExtraBold', letterSpacing: -0.7 }}>
                Take a quick selfie
              </Text>
              <Text style={{ maxWidth: 300, color: c.muted, fontSize: 15, lineHeight: 22.5, fontFamily: 'Inter_400Regular', textAlign: 'center' }}>
                We match it with your NIN photo to make sure it's really you.
              </Text>
            </View>
            {errorBox}
            <View style={{ paddingVertical: 6, paddingHorizontal: 16, borderRadius: 20, backgroundColor: c.card, borderWidth: 1, borderColor: c.cardLine, boxShadow: c.shadow }}>
              {SELFIE_TIPS.map((t, i) => {
                const Icon = TIP_ICONS[t.icon];
                return (
                  <View
                    key={t.label}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}
                  >
                    <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: c.chip, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon color={c.text} size={18} />
                    </View>
                    <Text style={{ color: c.text, fontSize: 15, fontFamily: 'Inter_400Regular' }}>{t.label}</Text>
                  </View>
                );
              })}
            </View>
            <View style={{ flex: 1 }} />
            <View>
              <Button label="Start" icon={Camera} onPress={startSelfie} />
              <TextButton label="Why we need this" tone="muted" padding={12} onPress={() => setSheet('selfieWhy')} />
              <View style={{ marginTop: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <ShieldCheck color={c.faint} size={13} />
                <Text style={{ color: c.faint, fontSize: 12, fontFamily: 'Inter_400Regular' }}>Secured by Smile ID</Text>
              </View>
            </View>
          </>
        );

      case 'selfieFail':
        return (
          <>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Enter kind="pop" duration={500} style={{ marginBottom: 10 }}>
                <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: c.failSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <ScanFace color={c.fail} size={40} />
                </View>
              </Enter>
              <Text accessibilityRole="header" style={{ color: c.text, fontSize: 24, fontFamily: 'Inter_800ExtraBold', letterSpacing: -0.6, textAlign: 'center' }}>
                We couldn't confirm it's you
              </Text>
              <Text style={{ maxWidth: 290, color: c.muted, fontSize: 15, lineHeight: 22.5, fontFamily: 'Inter_400Regular', textAlign: 'center' }}>
                {failText || "Your face wasn't clear enough."}
              </Text>
              <View style={{ marginTop: 8, paddingVertical: 5, paddingHorizontal: 12, borderRadius: 999, backgroundColor: c.warnSoft }}>
                <Text style={{ color: c.warn, fontSize: 13, fontFamily: 'Inter_700Bold' }}>{triesLeft(attemptsLeft)}</Text>
              </View>
            </View>
            {errorBox}
            <View>
              <Button label="Try again" icon={RotateCcw} onPress={startSelfie} />
              <TextButton label="See the tips again" tone="muted" padding={12} onPress={() => go('selfie')} />
            </View>
          </>
        );

      case 'confirm':
        return (
          <>
            <OnbTitle title="Is this you?" sub="Your selfie matched. This is what NIMC has on record for your NIN." />
            {errorBox}
            <Enter kind="rise" duration={350}>
              <View
                style={{
                  paddingTop: 20,
                  paddingHorizontal: 18,
                  paddingBottom: 6,
                  borderRadius: 22,
                  backgroundColor: c.card,
                  borderWidth: 1,
                  borderColor: c.cardLine,
                  boxShadow: c.shadow,
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                {person?.photoUrl ? (
                  <Image
                    source={{ uri: person.photoUrl }}
                    accessibilityLabel="Your NIN photo"
                    style={{ width: 64, height: 64, borderRadius: 32, borderWidth: 4, borderColor: c.brandSoft }}
                  />
                ) : (
                  <LinearGradient
                    colors={['#0A7A5A', '#022C22']}
                    start={{ x: 0.21, y: 0.09 }}
                    end={{ x: 0.79, y: 0.91 }}
                    style={{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', boxShadow: `0px 0px 0px 4px ${c.brandSoft}` }}
                  >
                    <Text style={{ color: '#FFFFFF', fontSize: 22, fontFamily: 'Inter_800ExtraBold' }}>{initialsOf(person?.firstName, person?.lastName)}</Text>
                  </LinearGradient>
                )}
                <Text style={{ marginTop: 6, color: c.text, fontSize: 20, fontFamily: 'Inter_800ExtraBold', letterSpacing: -0.4, textAlign: 'center' }}>
                  {person?.fullName ?? ''}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, backgroundColor: c.brandSoft }}>
                  <ShieldCheck color={c.brandText} size={13} />
                  <Text style={{ color: c.brandText, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>Verified with NIMC</Text>
                </View>
                <View style={{ alignSelf: 'stretch', marginTop: 10 }}>
                  {[
                    ['Date of birth', dobLabel(dobFromIso(person?.dateOfBirth) ?? dob)],
                    ['NIN', person?.ninMasked ?? ''],
                  ].map(([k, v]) => (
                    <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 13, borderTopWidth: 1, borderTopColor: c.line }}>
                      <Text style={{ color: c.muted, fontSize: 14, fontFamily: 'Inter_400Regular' }}>{k}</Text>
                      <Text style={{ color: c.text, fontSize: 14, fontFamily: 'Inter_600SemiBold', letterSpacing: k === 'NIN' ? 0.84 : 0, fontVariant: ['tabular-nums'] }}>
                        {v}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            </Enter>
            <View style={{ flex: 1 }} />
            <View>
              <Button label="Yes, that's me" onPress={confirmYes} />
              <TextButton label="This isn't me" tone="muted" padding={12} onPress={() => setSheet('notMe')} />
            </View>
          </>
        );

      case 'addr':
        return (
          <>
            <OnbTitle title="Where do you live?" sub="We need your home address for your account." />
            {errorBox}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
                {label('State')}
                <Tap onPress={() => setSheet('state')} accessibilityRole="button" accessibilityLabel={`State, ${state || 'choose'}`} style={fieldBox}>
                  <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: state ? c.text : c.faint, fontSize: 16, fontFamily: 'Inter_400Regular' }}>
                    {state || 'Choose'}
                  </Text>
                  <ChevronDown color={c.faint} size={18} />
                </Tap>
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
                {label('LGA')}
                <Tap
                  onPress={() => state && setSheet('lga')}
                  disabled={!state}
                  accessibilityRole="button"
                  accessibilityLabel={`LGA, ${lga || 'choose'}`}
                  style={{ ...fieldBox, opacity: state ? 1 : 0.45 }}
                >
                  <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: lga ? c.text : c.faint, fontSize: 16, fontFamily: 'Inter_400Regular' }}>
                    {lga || 'Choose'}
                  </Text>
                  <ChevronDown color={c.faint} size={18} />
                </Tap>
              </View>
            </View>
            <View style={{ gap: 8 }}>
              {label('Street address')}
              <View style={{ borderRadius: 16, backgroundColor: c.card, borderWidth: 1.5, borderColor: c.line, paddingVertical: 14, paddingHorizontal: 16 }}>
                <TextInput
                  value={street}
                  onChangeText={setStreet}
                  multiline
                  numberOfLines={2}
                  placeholder="House number and street"
                  placeholderTextColor={c.faint}
                  accessibilityLabel="Street address"
                  textAlignVertical="top"
                  autoCapitalize="words"
                  style={{ minHeight: 45, padding: 0, color: c.text, fontSize: 16, lineHeight: 22.4, fontFamily: 'Inter_400Regular' }}
                />
              </View>
            </View>
            <View style={{ gap: 8 }}>
              {label('Nearest landmark', 'Optional')}
              <View style={fieldBox}>
                <TextInput
                  value={landmark}
                  onChangeText={setLandmark}
                  placeholder="e.g. Opposite Mega Plaza"
                  placeholderTextColor={c.faint}
                  accessibilityLabel="Nearest landmark, optional"
                  style={{ flex: 1, alignSelf: 'stretch', color: c.text, fontSize: 16, fontFamily: 'Inter_400Regular' }}
                />
              </View>
            </View>
            <View style={{ flex: 1, minHeight: 16 }} />
            <Button label="Continue" disabled={!addressReady(state, lga, street)} onPress={finish} />
          </>
        );

      case 'review':
        return (
          <>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <Enter kind="pop" duration={500} style={{ marginBottom: 10 }}>
                <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: c.warnSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Clock color={c.warn} size={40} />
                </View>
              </Enter>
              <Text accessibilityRole="header" style={{ color: c.text, fontSize: 28, fontFamily: 'Inter_800ExtraBold', letterSpacing: -0.7, textAlign: 'center' }}>
                We're checking your details
              </Text>
              <Text style={{ maxWidth: 300, color: c.muted, fontSize: 15, lineHeight: 22.5, fontFamily: 'Inter_400Regular', textAlign: 'center' }}>
                Our team will review your sign-up and text you within 24 hours.
              </Text>
            </View>
            <Button
              label="OK"
              onPress={async () => {
                // The server keeps the session for the reviewers; only the
                // phone forgets it.
                await saveSignup(null);
                navigation.goBack();
              }}
            />
          </>
        );
    }
  })();

  const scrolls = stage === 'nin' || stage === 'addr' || stage === 'confirm' || stage === 'selfie';

  return (
    <OnbFrame>
      {stage !== 'review' ? <SignupHeader step={SU_STEP[stage]} onBack={back} onSaveExit={saveAndExit} /> : null}
      <Enter kind={stage === 'review' ? 'fade' : 'screenIn'} key={stage} style={{ flex: 1, marginTop: stage === 'review' ? 0 : 22 }}>
        {scrolls ? (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1, gap: 16 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {body}
          </ScrollView>
        ) : (
          <View style={{ flex: 1, gap: 16 }}>{body}</View>
        )}
      </Enter>

      <DobSheet
        visible={sheet === 'dob'}
        value={dob}
        onClose={() => setSheet(null)}
        onDone={(d) => {
          setDob(d);
          setSheet(null);
          clearError();
        }}
      />
      <StateSheet
        visible={sheet === 'state'}
        value={state}
        onClose={() => setSheet(null)}
        onPick={(s) => {
          if (s !== state) setLga('');
          setState(s);
          setSheet(null);
        }}
      />
      <LgaSheet
        visible={sheet === 'lga'}
        state={state}
        value={lga}
        onClose={() => setSheet(null)}
        onPick={(l) => {
          setLga(l);
          setSheet(null);
        }}
      />
      <NinDataSheet visible={sheet === 'ninData'} onClose={() => setSheet(null)} />
      <SelfieWhySheet visible={sheet === 'selfieWhy'} onClose={() => setSheet(null)} />
      <NotMeSheet visible={sheet === 'notMe'} onClose={() => setSheet(null)} />
      <HeartbeatLoader visible={busy} />
    </OnbFrame>
  );
}
