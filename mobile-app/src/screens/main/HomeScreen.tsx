import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bell } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { MonoProvider, useMonoConnect } from '@mono.co/connect-react-native';

import { ConfirmIdentitySheet } from '../../components/ui/ConfirmIdentitySheet';
import { Avatar, BottomSheet, IconButton, PressScale } from '../../components/ds';
import { BankCarousel, CARD_HEIGHT, MAX_LINKED } from '../../components/home/BankCarousel';
import { AllServices, PalmCard, PayBillsCard } from '../../components/home/HomeSections';
import { PromoCarousel } from '../../components/home/PromoCarousel';
import { TxCard, TxRow } from '../../components/activity/TxRow';
import { TxDetailSheet } from '../../components/activity/TxDetailSheet';
import { useTxHelp } from '../../components/activity/useTxHelp';
import {
  useAuthStore,
  useBankStore,
  useNotificationStore,
  useTransactionStore,
} from '../../store/useStore';
import { useThemeColors } from '../../theme/useThemeColors';
import { bankLabel, matchesAccount, unreadCount } from '../../lib/activityView';
import { PROMOS } from '../../lib/promos';
import type { ServiceType } from '../../lib/services';

function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/**
 * Home (design handoff, screen 5): who you are and your unread alerts, your
 * linked bank cards — the one you are "Paying from" — Palm Pay, the bills you
 * can pay, and the last few payments from the chosen card.
 */
function HomeContent({ navigation }: any) {
  const c = useThemeColors();
  const user = useAuthStore((s) => s.user);

  const accounts = useBankStore((s) => s.linkedAccounts);
  const activeBankIndex = useBankStore((s) => s.activeBankIndex);
  const setActiveBankIndex = useBankStore((s) => s.setActiveBankIndex);
  const accountsLoading = useBankStore((s) => s.isLoading);
  const fetchAccounts = useBankStore((s) => s.fetchAccounts);

  const transactions = useTransactionStore((s) => s.transactions);
  const fetchTransactions = useTransactionStore((s) => s.fetchTransactions);
  const subscribeToLive = useTransactionStore((s) => s.subscribeToLive);

  const notifications = useNotificationStore((s) => s.notifications);
  const fetchNotifications = useNotificationStore((s) => s.fetchNotifications);

  const [servicesOpen, setServicesOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmingLink, setConfirmingLink] = useState(false);
  const { init } = useMonoConnect();

  useEffect(() => {
    if (!user?.id) return;
    void fetchAccounts(user.id);
    void fetchTransactions(user.id, user.customerId);
    void fetchNotifications();
    // Live history, balance and inbox. A purchase settles asynchronously —
    // the bank confirms by webhook and the airtime follows — so rows really
    // do change while this screen is open. One channel per session, opened
    // here because Home is where every session starts.
    return subscribeToLive(user.id);
  }, [user?.id, user?.customerId]);

  // An unlinked account can leave the chosen index pointing past the end.
  const activeIndex = activeBankIndex < accounts.length ? activeBankIndex : 0;
  useEffect(() => {
    if (activeBankIndex !== activeIndex) setActiveBankIndex(activeIndex);
  }, [activeBankIndex, activeIndex, setActiveBankIndex]);

  const active = accounts[activeIndex];
  const recent = useMemo(
    () => transactions.filter((t) => matchesAccount(t, active?.id ?? null)).slice(0, 4),
    [transactions, active?.id],
  );
  const selected = selectedId ? transactions.find((t) => t.id === selectedId) ?? null : null;
  const accountLabelFor = (id?: string | null) => {
    const match = id ? accounts.find((a) => a.id === id) : undefined;
    return match ? bankLabel(match.bankName, match.accountNumber) : null;
  };
  const unread = unreadCount(notifications);
  const help = useTxHelp(navigation, () => setSelectedId(null));

  const openService = (serviceType: ServiceType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setServicesOpen(false);
    navigation.navigate('QuickService', { serviceType });
  };

  /**
   * Linking a bank account is a sensitive action, so it is gated on the device
   * fingerprint with the MiliPay PIN as the fallback: anyone holding an
   * unlocked handset must not be able to attach an account.
   *
   * Mono ties the connection — and any Direct Debit mandate signed against it
   * — to the name and email we hand over. Refusing to link is recoverable;
   * linking a real bank account under a placeholder identity is not.
   */
  const startLink = () => {
    if (accounts.length >= MAX_LINKED) {
      Alert.alert('Limit reached', 'You can link up to 3 bank accounts. Remove one to link another.');
      return;
    }
    const hasCompleteIdentity = Boolean(user?.email?.trim() && user?.firstName?.trim() && user.firstName !== 'User');
    if (!hasCompleteIdentity) {
      Alert.alert(
        'We need your details first',
        'Your bank has to match this account to your full name and email address, and we do not have both on file. Contact support or the agent who enrolled you, then try again.',
      );
      return;
    }
    setConfirmingLink(true);
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 6, paddingHorizontal: 20 }}>
          <PressScale
            scaleTo={0.94}
            onPress={() => navigation.navigate('ProfileSettings')}
            accessibilityRole="button"
            accessibilityLabel="Your profile"
          >
            <Avatar firstName={user?.firstName} lastName={user?.lastName} size={44} />
          </PressScale>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: c.muted, fontSize: 13, fontFamily: 'Inter_400Regular' }}>{greeting()}</Text>
            <Text numberOfLines={1} style={{ color: c.text, fontSize: 19, fontFamily: 'Inter_700Bold', letterSpacing: -0.19 }}>
              {user?.firstName || 'there'}
            </Text>
          </View>
          <IconButton icon={Bell} label="Notifications" iconSize={20} badge={unread} onPress={() => navigation.navigate('Notifications')} />
        </View>

        {accountsLoading && accounts.length === 0 ? (
          <View style={{ marginTop: 18, marginHorizontal: 20, height: CARD_HEIGHT, borderRadius: 26, backgroundColor: c.chip }} />
        ) : (
          <BankCarousel accounts={accounts} activeIndex={activeIndex} onSelect={setActiveBankIndex} onLink={startLink} />
        )}

        <PalmCard enrolled={!!user?.hasPalm} onPress={() => navigation.navigate('PalmTab')} />

        <PayBillsCard onOpen={openService} onAll={() => setServicesOpen(true)} />

        <PromoCarousel promos={PROMOS} />

        <View style={{ marginTop: 20, marginHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexShrink: 1 }}>
            <Text accessibilityRole="header" style={{ color: c.text, fontSize: 16, fontFamily: 'Inter_700Bold', letterSpacing: -0.16 }}>
              Recent
            </Text>
            {active ? (
              <Text numberOfLines={1} style={{ color: c.muted, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>
                {bankLabel(active.bankName, active.accountNumber)}
              </Text>
            ) : null}
          </View>
          <Pressable onPress={() => navigation.navigate('ActivityTab')} hitSlop={8} accessibilityRole="button">
            <Text style={{ color: c.brandText, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>See all</Text>
          </Pressable>
        </View>
        <View style={{ marginTop: 10, marginHorizontal: 20 }}>
          <TxCard>
            {recent.length === 0 ? (
              <Text style={{ paddingVertical: 22, paddingHorizontal: 16, textAlign: 'center', color: c.muted, fontSize: 13, fontFamily: 'Inter_400Regular' }}>
                {active ? 'No payments from this account yet.' : 'No payments yet.'}
              </Text>
            ) : (
              recent.map((tx) => <TxRow key={tx.id} tx={tx} onPress={setSelectedId} />)
            )}
          </TxCard>
        </View>
      </ScrollView>

      <BottomSheet visible={servicesOpen} onClose={() => setServicesOpen(false)} title="All services">
        <AllServices onOpen={openService} />
      </BottomSheet>

      <TxDetailSheet
        tx={selected}
        accountLabel={accountLabelFor(selected?.account_used)}
        onClose={() => setSelectedId(null)}
        onHelp={(tx) => void help(tx)}
      />

      <ConfirmIdentitySheet
        visible={confirmingLink}
        reason="Confirm it is you before linking a bank account to MiliPay."
        onConfirmed={() => {
          setConfirmingLink(false);
          init();
        }}
        onCancel={() => setConfirmingLink(false)}
      />
    </SafeAreaView>
  );
}

export default function HomeScreen({ navigation }: any) {
  const user = useAuthStore((state) => state.user);
  const linkMonoAccount = useBankStore((s) => s.linkMonoAccount);

  // Mono records this as the identity behind the bank connection, and under the
  // Direct Debit model it is the identity a mandate is signed against. It used
  // to fall back to "Test User" / "test@biopay.app", so a customer whose
  // session carried no email — the store defaults it to an empty string —
  // linked a real bank account under a placeholder. `startLink` above stops
  // the widget opening at all in that case.
  const monoConfig = {
    publicKey: process.env.EXPO_PUBLIC_MONO_PUBLIC_KEY || '',
    scope: 'auth',
    data: {
      customer: {
        name: [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim(),
        email: user?.email ?? '',
      },
    },
    onClose: () => {},
    onSuccess: async (data: any) => {
      try {
        const code = data.getAuthCode();
        await linkMonoAccount(code);

        // Linking is the moment a customer is thinking about how much this
        // account should be allowed to move, so offer the limits screen here
        // rather than leaving it buried in Settings.
        Alert.alert(
          'Bank account linked',
          'Would you like to set your transaction limits now? You can always change them later in Settings.',
          [
            { text: 'Later', style: 'cancel' },
            { text: 'Set limits', onPress: () => navigation.navigate('AccountLimits') },
          ],
        );
      } catch (err) {
        console.error('Mono link error', err);
        Alert.alert('Could not link account', err instanceof Error ? err.message : 'Please try again.');
      }
    },
  };

  return (
    <MonoProvider {...monoConfig}>
      <HomeContent navigation={navigation} />
    </MonoProvider>
  );
}
