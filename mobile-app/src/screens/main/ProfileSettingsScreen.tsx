import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, ChevronRight, Lock, Mail, MapPin, Phone, ShieldCheck, Sliders, User, type LucideIcon } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { HeartbeatLoader, PressScale, ScreenHeader } from '../../components/ds';
import { ContactCodeSheet } from '../../components/me/ContactCodeSheet';
import { ContactPinSheet } from '../../components/me/ContactPinSheet';
import type { CodeChannel } from '../../lib/codeChannelView';
import { useAuthStore } from '../../store/useStore';
import { useThemeColors } from '../../theme/useThemeColors';
import { brandFixed } from '../../theme/tokens';
import { formatPhone, naira0 } from '../../lib/purchaseForm';
import { cancelContactChange, startContactChange, type ContactStep } from '../../lib/contactChange';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^0[789][01]\d{8}$/;

/**
 * Profile & identity (design handoff, screen 10). Names and address save
 * straight away. A new email or phone number is confirmed first by a code
 * sent to it; nothing — not even the name — is saved until every code is
 * right, and closing the code sheet discards the change. A verified phone
 * becomes the number the customer signs in with. The NIN is read-only.
 *
 * Before any code is sent, the customer confirms with their PIN, and picks
 * how a new number's code comes (SMS, a call or WhatsApp).
 */
export default function ProfileSettingsScreen({ navigation }: any) {
  const c = useThemeColors();
  const user = useAuthStore((s) => s.user);
  const onboarding = useAuthStore((s) => s.onboarding);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const applyVerifiedContact = useAuthStore((s) => s.applyVerifiedContact);

  const curFirst = user?.firstName ?? '';
  const curLast = user?.lastName ?? '';
  const curAddr = user?.address ?? '';
  const curEmail = (user?.email ?? '').toLowerCase();
  const curPhone = (user?.phone ?? '').replace(/\D/g, '');

  const [first, setFirst] = useState(curFirst);
  const [last, setLast] = useState(curLast);
  const [addr, setAddr] = useState(curAddr);
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(curPhone);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [request, setRequest] = useState<{ id: string; steps: ContactStep[]; phoneVia: CodeChannel } | null>(null);
  const [pinOpen, setPinOpen] = useState(false);

  const emailChanged = email.trim().toLowerCase() !== curEmail;
  const phoneChanged = phone !== curPhone;
  const detailsChanged = first.trim() !== curFirst || last.trim() !== curLast || addr.trim() !== curAddr;
  const modified = detailsChanged || emailChanged || phoneChanged;

  const tier = onboarding?.kycTier ?? user?.kycTier ?? 2;
  const pinThreshold = user?.pinThreshold ?? onboarding?.pinThreshold ?? 10000;
  const initials = `${first.trim()[0] ?? ''}${last.trim()[0] ?? ''}`.toUpperCase() || 'ME';
  const fullName = `${first.trim()} ${last.trim()}`.trim() || 'Your name';

  const saveDetails = async (): Promise<boolean> => {
    if (!detailsChanged) return true;
    const result = await updateProfile({ firstName: first, lastName: last, address: addr });
    if (!result.success) setError(result.error ?? "Couldn't save your changes. Please try again.");
    return result.success;
  };

  const save = async () => {
    if (!modified || loading) return;
    if (!first.trim() || !last.trim()) return setError('Enter your first and last name.');
    if (emailChanged && !EMAIL_RE.test(email.trim())) return setError('Enter a valid email address.');
    if (phoneChanged && !PHONE_RE.test(phone)) return setError('Enter a valid 11-digit Nigerian phone number.');
    setError('');

    if (!emailChanged && !phoneChanged) {
      setLoading(true);
      const ok = await saveDetails();
      setLoading(false);
      if (ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        navigation.goBack();
      }
      return;
    }

    // The PIN comes first; the sheet then starts the change.
    setPinOpen(true);
  };

  /** From the PIN sheet: an error to show there, or null once the codes are on their way. */
  const startChange = async (pin: string, phoneVia: CodeChannel): Promise<string | null> => {
    const started = await startContactChange(
      {
        ...(emailChanged ? { email: email.trim().toLowerCase() } : {}),
        ...(phoneChanged ? { phone } : {}),
      },
      pin,
      phoneVia,
    );
    if (!started.ok && started.pinWrong) return started.message;
    setPinOpen(false);
    if (!started.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setError(started.message);
      return null;
    }
    setRequest({ id: started.requestId, steps: started.steps, phoneVia });
    return null;
  };

  const finish = async (saved: { email: string | null; phone: string | null }) => {
    setRequest(null);
    applyVerifiedContact(saved);
    setLoading(true);
    const ok = await saveDetails();
    setLoading(false);
    if (ok) navigation.goBack();
  };

  const discard = () => {
    if (request) void cancelContactChange(request.id);
    setRequest(null);
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScreenHeader title="Profile & identity" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={{ alignItems: 'center', gap: 10, marginTop: 22 }}>
            <View
              style={{
                width: 104,
                height: 104,
                borderRadius: 52,
                backgroundColor: c.card,
                borderWidth: 1,
                borderColor: c.cardLine,
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0px 0px 28px 6px rgba(0, 200, 150, 0.18)',
              }}
            >
              <Text style={{ color: c.brandText, fontSize: 36, fontFamily: 'Inter_800ExtraBold', letterSpacing: -0.72 }}>{initials}</Text>
            </View>
            <Text style={{ color: c.text, fontSize: 20, fontFamily: 'Inter_800ExtraBold', letterSpacing: -0.4 }}>{fullName}</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  paddingVertical: 5,
                  paddingHorizontal: 10,
                  borderRadius: 10,
                  backgroundColor: user?.ninVerified ? c.brandSoft : c.chip,
                }}
              >
                <ShieldCheck color={user?.ninVerified ? c.brandText : c.muted} size={13} />
                <Text style={{ color: user?.ninVerified ? c.brandText : c.muted, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>
                  {user?.ninVerified ? 'NIN verified' : 'NIN not verified'}
                </Text>
              </View>
              <View style={{ paddingVertical: 5, paddingHorizontal: 10, borderRadius: 10, backgroundColor: c.chip }}>
                <Text style={{ color: c.muted, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>Tier {tier}</Text>
              </View>
            </View>
          </View>

          <SectionLabel>Personal details</SectionLabel>
          <FieldCard>
            <Field icon={User} label="First name" value={first} onChange={(v) => { setFirst(v); setError(''); }} placeholder="First name" />
            <Field icon={User} label="Last name" value={last} onChange={(v) => { setLast(v); setError(''); }} placeholder="Last name" first={false} />
          </FieldCard>

          <SectionLabel>Contact information</SectionLabel>
          <FieldCard>
            <Field
              icon={Mail}
              label="Email"
              value={email}
              onChange={(v) => { setEmail(v); setError(''); }}
              placeholder="you@example.com"
              keyboardType="email-address"
              tag={emailChanged}
            />
            <Field
              icon={Phone}
              label="Phone number"
              value={formatPhone(phone)}
              onChange={(v) => { setPhone(v.replace(/[^0-9]/g, '').slice(0, 11)); setError(''); }}
              placeholder="0803 000 0000"
              keyboardType="phone-pad"
              tag={phoneChanged}
              first={false}
            />
          </FieldCard>
          <View style={{ marginTop: 8, marginHorizontal: 24, flexDirection: 'row', gap: 6 }}>
            <View style={{ paddingTop: 1 }}>
              <ShieldCheck color={c.faint} size={13} />
            </View>
            <Text style={{ flex: 1, color: c.faint, fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular' }}>
              If you change your email or phone number, we'll send a code to the new one. Your changes save once you enter it.
            </Text>
          </View>

          <SectionLabel>Identity and address</SectionLabel>
          <FieldCard>
            <Field icon={MapPin} label="Residential address" value={addr} onChange={(v) => { setAddr(v); setError(''); }} placeholder="Residential address" />
            <View style={{ height: 58, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: c.line }}>
              <ShieldCheck color={c.faint} size={18} />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={{ color: c.muted, fontSize: 11, fontFamily: 'Inter_600SemiBold' }}>NIN</Text>
                <Text style={{ color: user?.nin ? c.brandText : c.muted, fontSize: 15, fontFamily: 'Inter_500Medium', letterSpacing: 1.5 }}>
                  {user?.nin ? `•••• •••• ${user.nin.slice(-4)}` : 'Not provided'}
                </Text>
              </View>
              <Lock color={c.faint} size={14} />
            </View>
          </FieldCard>
          <Text style={{ marginTop: 8, marginHorizontal: 24, color: c.faint, fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular' }}>
            {user?.ninVerified
              ? 'Your National Identity Number (NIN) is verified and securely encrypted.'
              : 'Your National Identity Number (NIN) is securely encrypted.'}
          </Text>

          <SectionLabel>Security and limits</SectionLabel>
          <PressScale
            scaleTo={0.99}
            onPress={() => navigation.navigate('AccountLimits')}
            accessibilityRole="button"
            style={{
              marginTop: 8,
              marginHorizontal: 20,
              paddingVertical: 14,
              paddingHorizontal: 16,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              backgroundColor: c.card,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: c.cardLine,
              boxShadow: c.shadow,
            }}
          >
            <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: c.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Sliders color={c.brandText} size={18} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontSize: 15, fontFamily: 'Inter_700Bold' }}>Transaction limits & PIN</Text>
              <Text style={{ marginTop: 2, color: c.muted, fontSize: 12, fontFamily: 'Inter_400Regular' }}>
                Tier {tier} · PIN required over {naira0(pinThreshold)}
              </Text>
            </View>
            <ChevronRight color={c.faint} size={18} />
          </PressScale>

          {error ? (
            <View style={{ marginTop: 14, marginHorizontal: 20, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: c.failSoft }}>
              <Text style={{ color: c.fail, fontSize: 13, lineHeight: 18, fontFamily: 'Inter_400Regular' }}>{error}</Text>
            </View>
          ) : null}

          <PressScale
            onPress={() => void save()}
            disabled={!modified}
            accessibilityRole="button"
            accessibilityState={{ disabled: !modified }}
            style={{
              marginTop: 22,
              marginHorizontal: 20,
              height: 56,
              borderRadius: 16,
              backgroundColor: c.brand,
              opacity: modified ? 1 : 0.4,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <Check color={brandFixed.onBrand} size={18} strokeWidth={3} />
            <Text style={{ color: brandFixed.onBrand, fontSize: 16, fontFamily: 'Inter_700Bold' }}>Save changes</Text>
          </PressScale>
        </ScrollView>
      </KeyboardAvoidingView>

      <ContactPinSheet visible={pinOpen} phoneChanging={phoneChanged} onSubmit={startChange} onClose={() => setPinOpen(false)} />
      <ContactCodeSheet
        requestId={request?.id ?? null}
        steps={request?.steps ?? []}
        phoneVia={request?.phoneVia ?? 'sms'}
        onDone={(saved) => void finish(saved)}
        onClose={discard}
        onRestart={(message) => {
          setRequest(null);
          setError(message);
        }}
      />
      <HeartbeatLoader visible={loading} />
    </SafeAreaView>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  const c = useThemeColors();
  return (
    <Text
      style={{
        marginTop: 22,
        marginHorizontal: 24,
        color: c.faint,
        fontSize: 12,
        fontFamily: 'Inter_600SemiBold',
        letterSpacing: 0.96,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </Text>
  );
}

function FieldCard({ children }: { children: React.ReactNode }) {
  const c = useThemeColors();
  return (
    <View
      style={{
        marginTop: 8,
        marginHorizontal: 20,
        backgroundColor: c.card,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: c.cardLine,
        boxShadow: c.shadow,
        overflow: 'hidden',
      }}
    >
      {children}
    </View>
  );
}

function Field({
  icon: Icon,
  label,
  value,
  onChange,
  placeholder,
  keyboardType,
  tag,
  first = true,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  keyboardType?: 'email-address' | 'phone-pad';
  /** The amber "Needs code" tag: this change is confirmed by a code first. */
  tag?: boolean;
  first?: boolean;
}) {
  const c = useThemeColors();
  return (
    <View
      style={{
        height: 58,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: c.line,
      }}
    >
      <Icon color={c.faint} size={18} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={{ color: c.muted, fontSize: 11, fontFamily: 'Inter_600SemiBold' }}>{label}</Text>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={c.faint}
          keyboardType={keyboardType}
          autoCapitalize={keyboardType === 'email-address' ? 'none' : 'words'}
          autoCorrect={false}
          accessibilityLabel={label}
          style={{ padding: 0, color: c.text, fontSize: 15, fontFamily: 'Inter_500Medium' }}
        />
      </View>
      {tag ? (
        <View style={{ paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999, backgroundColor: c.warnSoft }}>
          <Text style={{ color: c.warn, fontSize: 11, fontFamily: 'Inter_700Bold' }}>Needs code</Text>
        </View>
      ) : null}
    </View>
  );
}
