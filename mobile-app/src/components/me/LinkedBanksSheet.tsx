import React, { useEffect, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Tap } from '../ds/Tap';
import { LinearGradient } from 'expo-linear-gradient';
import { Landmark, Plus, Trash2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { BottomSheet } from '../ds/BottomSheet';
import { PressScale } from '../ds/PressScale';
import { QuickPayPanel } from '../ui/QuickPayPanel';
import { MAX_LINKED } from '../banks/BankLinking';
import { useThemeColors } from '../../theme/useThemeColors';
import { bankCardTheme } from '../../theme/tokens';
import { useBankStore, usePalmStore, type LinkedAccount } from '../../store/useStore';
import { stopQuickPay, useQuickPay } from '../../lib/quickPay';

/**
 * Me › Linked banks (design handoff, screen 9): each linked account with a
 * trash button, "Link another account" while fewer than three are linked,
 * and — in the same sheet — the "Unlink GTBank?" confirmation.
 *
 * The last account cannot be unlinked: the trash button is not drawn, and the
 * server refuses it anyway (unlink_bank_account, LAST_ACCOUNT).
 *
 * Quick pay's controls sit under each account only once the business offers
 * quick pay at all; until then the sheet is exactly the design's.
 */
export function LinkedBanksSheet({
  visible,
  onClose,
  onLink,
}: {
  visible: boolean;
  onClose: () => void;
  /** "Link another account": the caller closes this and starts linking. */
  onLink: () => void;
}) {
  const c = useThemeColors();
  const accounts = useBankStore((s) => s.linkedAccounts);
  const unlinkAccount = useBankStore((s) => s.unlinkAccount);
  const palmAccountId = usePalmStore((s) => s.palm?.account?.id ?? null);
  const fetchPalm = usePalmStore((s) => s.fetchPalm);
  const [target, setTarget] = useState<LinkedAccount | null>(null);
  const [busy, setBusy] = useState(false);
  // Read while the sheet is open, and again whenever the app returns to the
  // foreground — which is when quick pay changes: the customer has just been
  // to Mono's page and their bank app.
  const quickPay = useQuickPay(visible);

  // Each opening starts on the list.
  useEffect(() => {
    if (visible) {
      setTarget(null);
      // Which account is the "Palm default" (palm_account_for on the server).
      void fetchPalm();
    }
  }, [visible, fetchPalm]);

  // The unlink view keeps drawing the account it was about while it closes.
  const lastTarget = useRef<LinkedAccount | null>(null);
  if (target) lastTarget.current = target;

  const confirmUnlink = async () => {
    if (!target || busy) return;
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const targetId = target.id;
    // A removed account must not keep a standing permission to debit it. The
    // server never debits an unlinked account either way; this also cancels
    // it at the bank.
    const quickPayState = quickPay.forAccount(targetId)?.state;
    if (quickPayState && quickPayState !== 'off') {
      await stopQuickPay(targetId).catch(() => false);
    }
    const result = await unlinkAccount(targetId);
    setBusy(false);
    if (!result.success) {
      Alert.alert("Couldn't unlink", result.error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setTarget(null);
  };

  const sub =
    accounts.length > 1
      ? `${accounts.length} of ${MAX_LINKED} linked. You need at least one to pay.`
      : accounts.length === 1
      ? 'You need at least one linked account to pay. Link another before unlinking this one.'
      : 'Link a bank account to pay for airtime, data and bills.';

  const unlinking = target ?? lastTarget.current;
  const unlinkIndex = unlinking ? Math.max(0, accounts.findIndex((a) => a.id === unlinking.id)) : 0;

  return (
    <BottomSheet visible={visible} onClose={onClose} title={target ? undefined : 'Linked banks'} dismissible={!busy}>
      {target && unlinking ? (
        <View>
          <View style={{ alignItems: 'center', gap: 6 }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: c.failSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Landmark color={c.fail} size={28} />
            </View>
            <Text accessibilityRole="header" style={{ marginTop: 10, color: c.text, fontSize: 20, fontFamily: 'Inter_800ExtraBold', letterSpacing: -0.4, textAlign: 'center' }}>
              Unlink {unlinking.bankName}?
            </Text>
            <Text style={{ paddingHorizontal: 12, color: c.muted, fontSize: 14, lineHeight: 20, fontFamily: 'Inter_400Regular', textAlign: 'center' }}>
              Are you sure you want to unlink your {unlinking.bankName} account? You won't be able to use it for transactions.
            </Text>
          </View>
          <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1.5, borderColor: c.line }}>
            <BankTile index={unlinkIndex} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontSize: 15, fontFamily: 'Inter_600SemiBold' }}>{unlinking.bankName}</Text>
              <Text style={{ marginTop: 2, color: c.muted, fontSize: 12, fontFamily: 'Inter_400Regular' }}>
                {unlinking.accountName} · ••{unlinking.accountNumber.slice(-4)}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
            <Tap
              onPress={() => setTarget(null)}
              disabled={busy}
              accessibilityRole="button"
              style={({ pressed }) => ({
                flex: 1,
                height: 54,
                borderRadius: 16,
                borderWidth: 1.5,
                borderColor: c.line,
                backgroundColor: pressed ? c.chip : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: busy ? 0.5 : 1,
              })}
            >
              <Text style={{ color: c.text, fontSize: 15, fontFamily: 'Inter_600SemiBold' }}>Cancel</Text>
            </Tap>
            <PressScale
              onPress={() => void confirmUnlink()}
              disabled={busy}
              accessibilityRole="button"
              style={{ flex: 1, height: 54, borderRadius: 16, backgroundColor: '#E5484D', alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.7 : 1 }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 15, fontFamily: 'Inter_700Bold' }}>{busy ? 'Unlinking…' : 'Unlink'}</Text>
            </PressScale>
          </View>
        </View>
      ) : (
        <View>
          <Text style={{ marginTop: 4, color: c.muted, fontSize: 13, fontFamily: 'Inter_400Regular' }}>{sub}</Text>
          <View style={{ gap: 8, marginTop: 16 }}>
            {accounts.map((acc, i) => (
              <View key={acc.id}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1.5, borderColor: c.line }}>
                  <BankTile index={i} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.text, fontSize: 15, fontFamily: 'Inter_600SemiBold' }}>{acc.bankName}</Text>
                    <Text style={{ marginTop: 2, color: c.muted, fontSize: 12, fontFamily: 'Inter_400Regular' }}>
                      {acc.accountName} · ••{acc.accountNumber.slice(-4)}
                    </Text>
                  </View>
                  {acc.id === palmAccountId ? (
                    <View style={{ paddingVertical: 3, paddingHorizontal: 8, borderRadius: 6, backgroundColor: c.brandSoft }}>
                      <Text style={{ color: c.brandText, fontSize: 11, fontFamily: 'Inter_600SemiBold' }}>Palm default</Text>
                    </View>
                  ) : null}
                  {accounts.length > 1 ? (
                    <PressScale
                      scaleTo={0.92}
                      hitSlop={5}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        setTarget(acc);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Unlink ${acc.bankName}`}
                      style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: c.failSoft, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Trash2 color={c.fail} size={18} />
                    </PressScale>
                  ) : null}
                </View>
                {/* Shown only once quick pay is offered at all. */}
                {quickPay.status.available && quickPay.forAccount(acc.id) ? (
                  <QuickPayPanel
                    view={quickPay.forAccount(acc.id)!}
                    allowances={quickPay.status.allowances}
                    missingDetails={quickPay.status.missingDetails}
                    onChanged={() => void quickPay.refresh()}
                    isDark={c.isDark}
                  />
                ) : null}
              </View>
            ))}
          </View>
          {accounts.length < MAX_LINKED ? (
            <Tap
              onPress={onLink}
              accessibilityRole="button"
              style={({ pressed }) => ({
                marginTop: 14,
                height: 54,
                borderRadius: 16,
                borderWidth: 1.5,
                borderStyle: 'dashed',
                borderColor: c.brand,
                backgroundColor: pressed ? c.brandSoft : 'transparent',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              })}
            >
              <Plus color={c.brandText} size={18} />
              <Text style={{ color: c.brandText, fontSize: 15, fontFamily: 'Inter_700Bold' }}>
                {accounts.length === 0 ? 'Link a bank account' : 'Link another account'}
              </Text>
            </Tap>
          ) : null}
          <Text style={{ marginTop: 10, color: c.faint, fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular', textAlign: 'center' }}>
            You'll confirm with your fingerprint or PIN, then sign in to your bank.
          </Text>
        </View>
      )}
    </BottomSheet>
  );
}

function BankTile({ index }: { index: number }) {
  const theme = bankCardTheme(index);
  return (
    <LinearGradient
      colors={theme.gradient as unknown as [string, string]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }}
    >
      <Landmark color="#FFFFFF" size={18} />
    </LinearGradient>
  );
}
