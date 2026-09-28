import React, { useEffect, useState } from 'react';
import { Alert, AppState, Linking, ScrollView, Text, View } from 'react-native';
import { Tap } from '../../components/ds/Tap';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Constants from 'expo-constants';
import {
  ChevronRight,
  CircleHelp,
  FileText,
  Fingerprint,
  Hand,
  Landmark,
  Lock,
  LogOut,
  Moon,
  ShieldCheck,
  Sliders,
  Sun,
  Bell,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useColorScheme } from 'nativewind';

import { Avatar, PressScale, Segmented, SettingsGroup, SettingsRow, Switch } from '../../components/ds';
import { BankLinkingProvider, MAX_LINKED, useBankLinking } from '../../components/banks/BankLinking';
import { LinkedBanksSheet } from '../../components/me/LinkedBanksSheet';
import { DoneSheet } from '../../components/me/DoneSheet';
import { ConfirmIdentitySheet } from '../../components/ui/ConfirmIdentitySheet';
import { useAuthStore, useBankStore } from '../../store/useStore';
import { useThemeColors } from '../../theme/useThemeColors';
import { brandFixed } from '../../theme/tokens';
import { formatPhone, naira0 } from '../../lib/purchaseForm';
import { SUPPORT_EMAIL } from '../../lib/brand';
import { notificationsEnabled, registerForPushNotifications, revokeThisDevice } from '../../lib/notifications';
import { saveThemePreference } from '../../lib/themePreference';
import {
  enrolBiometricUnlock,
  getBiometricCapability,
  isBiometricUnlockEnabled,
  setBiometricUnlockEnabled,
  type BiometricCapability,
} from '../../lib/deviceAuth';

/**
 * The Me tab (design handoff, screen 9): who you are and your tier, your
 * profile, then Money (linked banks, account limits), Security (fingerprint,
 * Change PIN), Preferences (appearance, payment alerts), Help, and Log out.
 */
function MeContent({ navigation, route }: any) {
  const c = useThemeColors();
  const user = useAuthStore((s) => s.user);
  const onboarding = useAuthStore((s) => s.onboarding);
  const logout = useAuthStore((s) => s.logout);
  const recordBiometricEnrolled = useAuthStore((s) => s.setBiometricEnrolled);
  const accounts = useBankStore((s) => s.linkedAccounts);
  const { startLink } = useBankLinking();
  const { colorScheme, setColorScheme } = useColorScheme();

  const tier = onboarding?.kycTier ?? user?.kycTier ?? 2;
  const pinThreshold = user?.pinThreshold ?? onboarding?.pinThreshold ?? 10000;

  const [banksOpen, setBanksOpen] = useState(false);
  const [confirmingPin, setConfirmingPin] = useState(false);
  const [pinDone, setPinDone] = useState(false);

  // Back from Change PIN with a new PIN saved.
  const pinChanged = route?.params?.pinChanged;
  useEffect(() => {
    if (!pinChanged) return;
    setPinDone(true);
    navigation.setParams({ pinChanged: undefined });
  }, [pinChanged, navigation]);

  // Fingerprint unlock reflects the real SecureStore preference, not an
  // optimistic default.
  const [biometricOn, setBiometricOn] = useState(false);
  const [capability, setCapability] = useState<BiometricCapability | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.all([getBiometricCapability(), isBiometricUnlockEnabled()]).then(([cap, enabled]) => {
      if (cancelled) return;
      setCapability(cap);
      setBiometricOn(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleBiometric = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (biometricOn) {
      await setBiometricUnlockEnabled(false);
      await recordBiometricEnrolled(false);
      setBiometricOn(false);
      return;
    }
    if (!capability?.hasHardware || !capability?.isEnrolled) {
      Alert.alert(
        'Not available',
        `No ${capability?.label.toLowerCase() ?? 'biometrics'} are set up on this phone. Add one in your device settings first.`,
      );
      return;
    }
    const enrolled = await enrolBiometricUnlock('Confirm it is you to turn on biometric unlock');
    if (!enrolled) {
      Alert.alert('Not turned on', "That didn't match. Biometric unlock is still off.");
      return;
    }
    await recordBiometricEnrolled(true);
    setBiometricOn(true);
  };

  /**
   * Payment alerts follow the phone's own setting, re-read whenever the app
   * returns to the foreground: that is the only place they can be turned
   * off, and a switch here that disagreed with the system would lie.
   */
  const [alertsOn, setAlertsOn] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const read = () => notificationsEnabled().then((on) => !cancelled && setAlertsOn(on));
    void read();
    const sub = AppState.addEventListener('change', (state) => state === 'active' && void read());
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  const toggleAlerts = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (alertsOn) {
      Alert.alert(
        'Payment alerts are on',
        'You hear when a payment is confirmed, delivered or fails. Turn them off in your phone settings.',
        [
          { text: 'Close', style: 'cancel' },
          { text: 'Open settings', onPress: () => void Linking.openSettings() },
        ],
      );
      return;
    }
    const result = await registerForPushNotifications();
    if (result.ok) {
      setAlertsOn(true);
      return;
    }
    if (result.reason === 'simulator') {
      Alert.alert('Not available here', 'Notifications need a real device.');
      return;
    }
    if (result.reason === 'expo-go') {
      // Expo removed Android push from Expo Go in SDK 53. Sending someone to
      // their phone settings here would send them where there is nothing to find.
      Alert.alert('Not available in Expo Go', 'Payment alerts need the installed MiliPay app. Everything else works here.');
      return;
    }
    Alert.alert(
      'Turn on payment alerts',
      'Allow notifications for MiliPay in your phone settings and we will tell you when a payment is confirmed, delivered or fails.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open settings', onPress: () => void Linking.openSettings() },
      ],
    );
  };

  const theme: 'light' | 'dark' = colorScheme === 'dark' ? 'dark' : 'light';
  const setTheme = (next: 'light' | 'dark') => {
    Haptics.selectionAsync().catch(() => {});
    void saveThemePreference(next);
    setColorScheme(next);
  };

  const signOut = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    await revokeThisDevice();
    void logout();
  };

  const contactLine = [user?.phone ? formatPhone(user.phone) : null, user?.email || null].filter(Boolean).join(' · ');
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ');
  const version = Constants.expoConfig?.version ?? '';

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
        <View style={{ paddingTop: 8, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <PressScale scaleTo={0.94} onPress={() => navigation.navigate('ProfileSettings')} accessibilityRole="button" accessibilityLabel="Your profile">
            <Avatar firstName={user?.firstName} lastName={user?.lastName} size={46} variant="hero" />
          </PressScale>
          <View style={{ flex: 1, minWidth: 0, alignItems: 'flex-start', gap: 4 }}>
            <Text numberOfLines={1} style={{ color: c.text, fontSize: 19, fontFamily: 'Inter_800ExtraBold', letterSpacing: -0.38 }}>
              Hi, {user?.firstName || 'there'}
            </Text>
            <PressScale scaleTo={0.96} onPress={() => navigation.navigate('AccountLimits')} accessibilityRole="button" accessibilityLabel={`Tier ${tier}, account limits`}>
              <LinearGradient
                colors={brandFixed.gold as unknown as [string, string]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 3, paddingLeft: 8, paddingRight: 6, borderRadius: 999 }}
              >
                <ShieldCheck color={brandFixed.goldText} size={12} strokeWidth={2.5} />
                <Text style={{ color: brandFixed.goldText, fontSize: 11, fontFamily: 'Inter_800ExtraBold' }}>Tier {tier}</Text>
                <ChevronRight color={brandFixed.goldText} size={12} strokeWidth={2.5} />
              </LinearGradient>
            </PressScale>
          </View>
        </View>

        <PressScale
          scaleTo={0.99}
          onPress={() => navigation.navigate('ProfileSettings')}
          accessibilityRole="button"
          accessibilityLabel="Profile and identity"
          style={{
            marginTop: 14,
            marginHorizontal: 20,
            padding: 18,
            gap: 14,
            backgroundColor: c.card,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: c.cardLine,
            boxShadow: c.shadow,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Avatar firstName={user?.firstName} lastName={user?.lastName} size={58} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ color: c.text, fontSize: 18, fontFamily: 'Inter_700Bold' }}>
                {fullName || 'Your name'}
              </Text>
              <Text numberOfLines={1} style={{ marginTop: 2, color: c.muted, fontSize: 13, fontFamily: 'Inter_400Regular' }}>
                {contactLine}
              </Text>
            </View>
            <ChevronRight color={c.faint} size={20} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Badge
              icon={ShieldCheck}
              label={user?.ninVerified ? 'Identity verified' : 'Identity check pending'}
              tone={user?.ninVerified ? 'brand' : 'muted'}
            />
            <Badge icon={Hand} label={user?.hasPalm ? 'Palm enrolled' : 'Palm not enrolled'} tone={user?.hasPalm ? 'brand' : 'muted'} />
          </View>
        </PressScale>

        <SettingsGroup title="Money">
          <SettingsRow icon={Landmark} label="Linked banks" value={`${accounts.length} of ${MAX_LINKED}`} onPress={() => setBanksOpen(true)} />
          <SettingsRow
            icon={Sliders}
            label="Account limits"
            sub={`PIN required over ${naira0(pinThreshold)}`}
            value={`Tier ${tier}`}
            onPress={() => navigation.navigate('AccountLimits')}
          />
        </SettingsGroup>

        <SettingsGroup title="Security">
          <SettingsRow
            icon={Fingerprint}
            label="Biometric unlock"
            onPress={() => void toggleBiometric()}
            right={<Switch value={biometricOn} onChange={() => void toggleBiometric()} label="Biometric unlock" />}
          />
          <SettingsRow
            icon={Lock}
            label="Change PIN"
            sub="Used at terminals and to approve payments"
            chevron
            onPress={() => setConfirmingPin(true)}
          />
        </SettingsGroup>

        <SettingsGroup title="Preferences">
          <SettingsRow
            icon={theme === 'dark' ? Moon : Sun}
            label="Appearance"
            right={
              <Segmented
                options={[
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ]}
                value={theme}
                onChange={setTheme}
              />
            }
          />
          <SettingsRow
            icon={Bell}
            label="Payment alerts"
            sub="Confirmed, delivered or failed"
            onPress={() => void toggleAlerts()}
            right={<Switch value={alertsOn} onChange={() => void toggleAlerts()} label="Payment alerts" />}
          />
        </SettingsGroup>

        <SettingsGroup title="Help">
          <SettingsRow icon={CircleHelp} label="Help & support" sub="Chat with us 24/7" chevron onPress={() => navigation.navigate('SupportScreen')} />
          <SettingsRow
            icon={FileText}
            label="Terms & privacy"
            chevron
            onPress={() =>
              Alert.alert('Terms & privacy', `Our terms of use and privacy policy are available from support: ${SUPPORT_EMAIL}.`, [
                { text: 'Close', style: 'cancel' },
                { text: 'Email support', onPress: () => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`) },
              ])
            }
          />
        </SettingsGroup>

        <Tap
          onPress={() => void signOut()}
          accessibilityRole="button"
          style={({ pressed }) => ({
            marginTop: 18,
            marginHorizontal: 20,
            height: 52,
            borderRadius: 16,
            backgroundColor: c.failSoft,
            opacity: pressed ? 0.8 : 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          })}
        >
          <LogOut color={c.fail} size={18} />
          <Text style={{ color: c.fail, fontSize: 15, fontFamily: 'Inter_600SemiBold' }}>Log out</Text>
        </Tap>
        <Text style={{ marginTop: 14, textAlign: 'center', color: c.faint, fontSize: 12, fontFamily: 'Inter_400Regular' }}>
          MiliPay {version} · Payments in milliseconds
        </Text>
      </ScrollView>

      <LinkedBanksSheet
        visible={banksOpen}
        onClose={() => setBanksOpen(false)}
        onLink={() => {
          // One sheet at a time: close this one, then the identity check opens.
          setBanksOpen(false);
          setTimeout(startLink, 260);
        }}
      />

      {/* Changing the PIN is gated on the same check as linking a bank: a
          stolen unlocked handset must not be able to reset the PIN freely. */}
      <ConfirmIdentitySheet
        visible={confirmingPin}
        reason="Confirm it is you before changing your transaction PIN."
        onConfirmed={() => {
          setConfirmingPin(false);
          navigation.navigate('ChangePin');
        }}
        onCancel={() => setConfirmingPin(false)}
      />

      <DoneSheet
        visible={pinDone}
        title="PIN changed"
        sub="Use your new PIN from now on, at terminals and in the app. We've sent you a security alert."
        onClose={() => setPinDone(false)}
      />
    </SafeAreaView>
  );
}

function Badge({ icon: Icon, label, tone }: { icon: typeof ShieldCheck; label: string; tone: 'brand' | 'muted' }) {
  const c = useThemeColors();
  const [bg, fg] = tone === 'brand' ? [c.brandSoft, c.brandText] : [c.chip, c.muted];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, backgroundColor: bg }}>
      <Icon color={fg} size={14} />
      <Text style={{ color: fg, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>{label}</Text>
    </View>
  );
}

export default function SettingsScreen({ navigation, route }: any) {
  const setActiveBankIndex = useBankStore((s) => s.setActiveBankIndex);
  // A newly linked account is shown on Home, as the chosen card (the
  // prototype's monoFinish).
  const onLinked = () => {
    setActiveBankIndex(Math.max(0, useBankStore.getState().linkedAccounts.length - 1));
    navigation.navigate('HomeTab');
  };
  return (
    <BankLinkingProvider onLinked={onLinked}>
      <MeContent navigation={navigation} route={route} />
    </BankLinkingProvider>
  );
}
