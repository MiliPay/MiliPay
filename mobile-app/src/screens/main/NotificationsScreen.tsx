import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AlertTriangle,
  Bell,
  Check,
  CheckCheck,
  Clock,
  Hand,
  RefreshCw,
  ShieldCheck,
  X,
  type LucideIcon,
} from 'lucide-react-native';

import { FilterChips, GroupLabel, PressScale, ScreenHeader } from '../../components/ds';
import { TxDetailSheet } from '../../components/activity/TxDetailSheet';
import { useTxHelp } from '../../components/activity/useTxHelp';
import { useBankStore, useNotificationStore, useTransactionStore, type AppNotification } from '../../store/useStore';
import { useThemeColors } from '../../theme/useThemeColors';
import type { ThemeColors } from '../../theme/tokens';
import {
  NOTIF_FILTERS,
  bankLabel,
  notifGroups,
  notifMatches,
  notifTimeLabel,
  notifVisual,
  unreadCount,
  type NotifFilter,
  type NotifIcon,
  type NotifTone,
} from '../../lib/activityView';

const ICONS: Record<NotifIcon, LucideIcon> = {
  check: Check,
  hand: Hand,
  clock: Clock,
  x: X,
  alert: AlertTriangle,
  refresh: RefreshCw,
  shield: ShieldCheck,
};

/** The prototype's NTONE: [tile fill, icon colour]. */
function toneColours(tone: NotifTone, c: ThemeColors): [string, string] {
  switch (tone) {
    case 'ok':
    case 'palm':
      return ['rgba(0, 200, 150, 0.14)', c.brandText];
    case 'warn':
      return [c.warnSoft, c.warn];
    case 'fail':
      return [c.failSoft, c.fail];
    case 'blue':
      return ['rgba(59, 130, 246, 0.14)', '#3B82F6'];
    default:
      return [c.chip, c.muted];
  }
}

/**
 * Notifications (design handoff, screen 13): what happened to your payments,
 * your palm and your account's security, newest first, grouped Today and
 * Earlier. Unread ones are tinted with a dot; the round button marks them all
 * read. Tapping a payment alert opens its transaction.
 *
 * Everything here is written by the database when it happens (migration
 * 20260927120000_customer_notifications) — nothing is composed on the phone.
 */
export default function NotificationsScreen({ navigation }: any) {
  const c = useThemeColors();
  const notifications = useNotificationStore((s) => s.notifications);
  const fetchNotifications = useNotificationStore((s) => s.fetchNotifications);
  const markRead = useNotificationStore((s) => s.markRead);
  const isLoading = useNotificationStore((s) => s.isLoading);
  const loadError = useNotificationStore((s) => s.error);
  const transactions = useTransactionStore((s) => s.transactions);
  const accounts = useBankStore((s) => s.linkedAccounts);

  const [filter, setFilter] = useState<NotifFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const help = useTxHelp(navigation, () => setSelectedId(null));

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  const unread = unreadCount(notifications);
  const groups = useMemo(() => notifGroups(notifications.filter((n) => notifMatches(n, filter))), [notifications, filter]);
  const selected = selectedId ? transactions.find((t) => t.id === selectedId) ?? null : null;
  const selectedAccount = selected?.account_used ? accounts.find((a) => a.id === selected.account_used) : undefined;

  const open = (n: AppNotification) => {
    if (!n.read_at) void markRead([n.id]);
    if (!n.reference) return;
    const tx = transactions.find((t) => t.reference === n.reference);
    if (tx) setSelectedId(tx.id);
    // Older than the list the app keeps: Activity reads it in and opens it.
    else navigation.navigate('ActivityTab', { reference: n.reference });
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScreenHeader
        title="Notifications"
        onBack={() => navigation.goBack()}
        right={
          <PressScale
            scaleTo={0.94}
            onPress={() => unread > 0 && void markRead()}
            disabled={unread === 0}
            accessibilityRole="button"
            accessibilityLabel="Mark all as read"
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: unread > 0 ? c.brandSoft : c.card,
              borderWidth: 1,
              borderColor: c.cardLine,
              boxShadow: c.shadow,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CheckCheck color={unread > 0 ? c.brandText : c.faint} size={20} />
          </PressScale>
        }
      />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading && notifications.length > 0} onRefresh={() => void fetchNotifications()} tintColor={c.brand} colors={[c.brand]} />}
      >
        <View style={{ paddingTop: 16 }}>
          <FilterChips options={NOTIF_FILTERS} value={filter} onChange={setFilter} />
        </View>

        {groups.map((g) => (
          <View key={g.title} style={{ marginTop: 18, marginHorizontal: 20 }}>
            <GroupLabel>{g.title}</GroupLabel>
            <View style={{ backgroundColor: c.card, borderRadius: 20, borderWidth: 1, borderColor: c.cardLine, boxShadow: c.shadow, overflow: 'hidden' }}>
              {g.items.map((n, i) => (
                <NotificationRow key={n.id} n={n} first={i === 0} onPress={() => open(n)} />
              ))}
            </View>
          </View>
        ))}

        {groups.length === 0 && !(isLoading && notifications.length === 0) ? (
          <View style={{ marginTop: 60, marginHorizontal: 20, alignItems: 'center', gap: 6 }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: c.chip, alignItems: 'center', justifyContent: 'center' }}>
              <Bell color={c.faint} size={24} />
            </View>
            <Text style={{ marginTop: 6, color: c.text, fontSize: 15, fontFamily: 'Inter_600SemiBold' }}>
              {loadError && notifications.length === 0 ? "Couldn't load your alerts" : "You're all caught up"}
            </Text>
            <Text style={{ color: c.muted, fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' }}>
              {loadError && notifications.length === 0 ? 'Check your connection, then pull down to try again.' : 'New alerts will show up here.'}
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

function NotificationRow({ n, first, onPress }: { n: AppNotification; first: boolean; onPress: () => void }) {
  const c = useThemeColors();
  const { icon, tone } = notifVisual(n);
  const Icon = ICONS[icon];
  const [tileBg, iconFg] = toneColours(tone, c);
  const unread = !n.read_at;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${unread ? 'Unread. ' : ''}${n.title}. ${n.body}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        gap: 12,
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: c.line,
        backgroundColor: pressed ? c.chip : unread ? c.brandSoft : 'transparent',
      })}
    >
      <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: tileBg, alignItems: 'center', justifyContent: 'center' }}>
        <Icon color={iconFg} size={20} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Text style={{ flex: 1, color: c.text, fontSize: 15, fontFamily: unread ? 'Inter_700Bold' : 'Inter_500Medium' }}>{n.title}</Text>
          <Text style={{ color: c.faint, fontSize: 12, fontFamily: 'Inter_400Regular' }}>{notifTimeLabel(n.created_at)}</Text>
        </View>
        <Text style={{ marginTop: 3, color: c.muted, fontSize: 13, lineHeight: 18, fontFamily: 'Inter_400Regular' }}>{n.body}</Text>
      </View>
      {unread ? <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 6, backgroundColor: c.brand }} /> : null}
    </Pressable>
  );
}
