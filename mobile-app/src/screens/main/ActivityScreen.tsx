import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Landmark, Receipt } from 'lucide-react-native';

import { FilterChips, GroupLabel, PressScale, TabTitle } from '../../components/ds';
import { TxCard, TxRow } from '../../components/activity/TxRow';
import { TxDetailSheet } from '../../components/activity/TxDetailSheet';
import { useTxHelp } from '../../components/activity/useTxHelp';
import { useAuthStore, useBankStore, useTransactionStore } from '../../store/useStore';
import { useThemeColors } from '../../theme/useThemeColors';
import { bankCardTheme } from '../../theme/tokens';
import { naira0 } from '../../lib/purchaseForm';
import {
  ACTIVITY_FILTERS,
  bankLabel,
  groupByDay,
  matchesAccount,
  matchesFilter,
  monthSummary,
  type ActivityFilter,
} from '../../lib/activityView';

/**
 * The Activity tab (design handoff, screen 6): this month's spending, filter
 * chips (All · Bills · Palm · Needs attention) and a second row by linked
 * bank, then the list grouped Today / Yesterday / Earlier. A row opens its
 * details. A tapped payment alert lands here with `reference` and opens that
 * transaction.
 */
export default function ActivityScreen({ navigation, route }: any) {
  const c = useThemeColors();
  const user = useAuthStore((s) => s.user);
  const accounts = useBankStore((s) => s.linkedAccounts);
  const transactions = useTransactionStore((s) => s.transactions);
  const fetchTransactions = useTransactionStore((s) => s.fetchTransactions);
  const isLoading = useTransactionStore((s) => s.isLoading);
  const loadError = useTransactionStore((s) => s.error);

  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const help = useTxHelp(navigation, () => setSelectedId(null));

  const refresh = () => {
    if (user?.id) void fetchTransactions(user.id, user.customerId);
  };

  // Home normally loads the list and keeps it live; this covers arriving here
  // first (a tapped alert on a cold start).
  useEffect(() => {
    if (transactions.length === 0) refresh();
  }, [user?.id]);

  // A filter for a bank that has since been unlinked would hide everything.
  useEffect(() => {
    if (accountId && !accounts.some((a) => a.id === accountId)) setAccountId(null);
  }, [accounts, accountId]);

  // Opened from a payment alert. If the transaction is not in the list yet
  // (the alert beat the list), read the list once more — once, so a
  // reference that never turns up cannot loop.
  const wanted: string | undefined = route?.params?.reference;
  const reloadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!wanted) return;
    const match = transactions.find((t) => t.reference === wanted);
    if (match) {
      setFilter('all');
      setAccountId(null);
      setSelectedId(match.id);
      navigation.setParams({ reference: undefined });
    } else if (!isLoading && reloadedFor.current !== wanted) {
      reloadedFor.current = wanted;
      refresh();
    }
  }, [wanted, transactions, isLoading]);

  const summary = useMemo(() => monthSummary(transactions, accountId), [transactions, accountId]);
  const groups = useMemo(
    () => groupByDay(transactions.filter((t) => matchesFilter(t, filter) && matchesAccount(t, accountId))),
    [transactions, filter, accountId],
  );
  const selected = selectedId ? transactions.find((t) => t.id === selectedId) ?? null : null;
  const selectedAccount = selected?.account_used ? accounts.find((a) => a.id === selected.account_used) : undefined;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading && transactions.length > 0} onRefresh={refresh} tintColor={c.brand} colors={[c.brand]} />}
      >
        <View style={{ paddingTop: 10, paddingHorizontal: 20 }}>
          <TabTitle>Activity</TabTitle>
        </View>

        <View
          style={{
            marginTop: 14,
            marginHorizontal: 20,
            paddingVertical: 16,
            paddingHorizontal: 18,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            backgroundColor: c.card,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: c.cardLine,
            boxShadow: c.shadow,
          }}
        >
          <View>
            <Text style={{ color: c.muted, fontSize: 13, fontFamily: 'Inter_400Regular' }}>Spent in {summary.monthName}</Text>
            <Text style={{ marginTop: 2, color: c.text, fontSize: 26, fontFamily: 'Inter_800ExtraBold', letterSpacing: -0.52, fontVariant: ['tabular-nums'] }}>
              {naira0(summary.spent)}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: c.muted, fontSize: 13, fontFamily: 'Inter_400Regular' }}>Palm payments</Text>
            <Text style={{ marginTop: 2, color: c.brandText, fontSize: 17, fontFamily: 'Inter_700Bold', fontVariant: ['tabular-nums'] }}>
              {naira0(summary.palm)}
            </Text>
          </View>
        </View>

        <View style={{ paddingTop: 14 }}>
          <FilterChips options={ACTIVITY_FILTERS} value={filter} onChange={setFilter} />
        </View>

        {accounts.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingTop: 8 }}>
            <BankChip label="All accounts" dot={c.faint} on={accountId === null} onPress={() => setAccountId(null)} />
            {accounts.map((a, i) => (
              <BankChip
                key={a.id}
                label={bankLabel(a.bankName, a.accountNumber)}
                dot={bankCardTheme(i).gradient[0]}
                on={accountId === a.id}
                onPress={() => setAccountId(a.id)}
              />
            ))}
          </ScrollView>
        ) : null}

        {groups.map((g) => (
          <View key={g.title} style={{ marginTop: 18, marginHorizontal: 20 }}>
            <GroupLabel>{g.title}</GroupLabel>
            <TxCard>
              {g.items.map((tx) => (
                <TxRow key={tx.id} tx={tx} onPress={setSelectedId} />
              ))}
            </TxCard>
          </View>
        ))}

        {groups.length === 0 && !(isLoading && transactions.length === 0) ? (
          <View style={{ marginTop: 40, marginHorizontal: 20, alignItems: 'center', gap: 6 }}>
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: c.chip, alignItems: 'center', justifyContent: 'center' }}>
              <Receipt color={c.faint} size={22} />
            </View>
            <Text style={{ marginTop: 6, color: c.text, fontSize: 15, fontFamily: 'Inter_600SemiBold' }}>
              {loadError && transactions.length === 0 ? "Couldn't load your activity" : 'Nothing here yet'}
            </Text>
            <Text style={{ color: c.muted, fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' }}>
              {loadError && transactions.length === 0
                ? 'Check your connection, then pull down to try again.'
                : 'Payments that match this filter will appear here.'}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <TxDetailSheet
        tx={selected}
        accountLabel={selectedAccount ? bankLabel(selectedAccount.bankName, selectedAccount.accountNumber) : null}
        onClose={() => setSelectedId(null)}
        onHelp={(tx) => void help(tx)}
      />
    </SafeAreaView>
  );
}

/** The linked-bank filter chip: a bank-coloured disc, then "GTBank ••6789". */
function BankChip({ label, dot, on, onPress }: { label: string; dot: string; on: boolean; onPress: () => void }) {
  const c = useThemeColors();
  return (
    <PressScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        paddingVertical: 6,
        paddingLeft: 6,
        paddingRight: 12,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: on ? c.brand : c.line,
        backgroundColor: on ? c.brandSoft : c.card,
      }}
    >
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: dot, alignItems: 'center', justifyContent: 'center' }}>
        <Landmark color="#FFFFFF" size={12} />
      </View>
      <Text style={{ color: on ? c.brandText : c.text, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>{label}</Text>
    </PressScale>
  );
}
