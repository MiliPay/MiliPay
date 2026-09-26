import React, { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert, Linking } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Zap } from 'lucide-react-native';

import { ConfirmIdentitySheet } from './ConfirmIdentitySheet';
import { startQuickPay, stopQuickPay } from '../../lib/quickPay';
import {
  missingDetailsMessage,
  quickPayCopy,
  type QuickPayAccountView,
} from '../../lib/quickPayCopy';

/**
 * Quick pay for one linked bank account: where it stands, and the one thing
 * the customer can do about it.
 *
 * Turning it on opens Mono's page ONCE, where the customer approves a
 * standing permission and is shown where to send ₦50 from this account. Their
 * bank then switches it on; from then on purchases from this account are
 * fingerprint-only. Nothing is charged by setting it up.
 *
 * Setup is inline rather than a sheet of its own, because this sits inside
 * the Linked Banks modal and a modal on a modal is unreliable across
 * platforms. The identity check is rendered inside the same tree for the
 * same reason.
 */

const TONE_COLOUR = {
  ok: '#00C896',
  pending: '#FFB454',
  bad: '#FF5C5C',
  neutral: '#94a3b8',
} as const;

const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`;

export function QuickPayPanel({
  view,
  allowances,
  missingDetails,
  onChanged,
  isDark,
}: {
  view: QuickPayAccountView;
  allowances: number[];
  missingDetails: string[];
  onChanged: () => void;
  isDark: boolean;
}) {
  const copy = quickPayCopy(view);
  const [choosing, setChoosing] = useState(false);
  const [allowance, setAllowance] = useState<number>(allowances[1] ?? allowances[0] ?? 0);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const begin = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (missingDetails.length > 0) {
      Alert.alert('We need a few details first', missingDetailsMessage(missingDetails));
      return;
    }
    setChoosing(true);
  };

  const start = async () => {
    setBusy(true);
    try {
      const result = await startQuickPay(view.linkedAccountId, allowance);
      if (!result.ok) {
        Alert.alert(
          "Quick pay isn't on",
          result.missing?.length ? missingDetailsMessage(result.missing) : result.message,
        );
        return;
      }
      setChoosing(false);
      try {
        await Linking.openURL(result.authorisationUrl);
      } catch {
        Alert.alert(
          'Could not open the page',
          "We couldn't open Mono's page. Nothing was charged — try again in a moment.",
        );
      }
    } finally {
      setBusy(false);
      onChanged();
    }
  };

  const stop = () => {
    const isSetup = copy.action === 'cancel_setup';
    Alert.alert(
      isSetup ? 'Cancel setup?' : 'Turn off quick pay?',
      'Purchases from this account will ask your bank to approve each one, as before.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: isSetup ? 'Cancel setup' : 'Turn off',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            const ok = await stopQuickPay(view.linkedAccountId);
            setBusy(false);
            if (!ok) Alert.alert('Please try again', "We couldn't reach MiliPay just now.");
            onChanged();
          },
        },
      ],
    );
  };

  const onAction = () => {
    if (copy.action === 'turn_on' || copy.action === 'try_again') begin();
    else if (copy.action === 'turn_off' || copy.action === 'cancel_setup') stop();
  };

  const actionLabel =
    copy.action === 'turn_on'
      ? 'Turn on'
      : copy.action === 'try_again'
        ? 'Try again'
        : copy.action === 'turn_off'
          ? 'Turn off'
          : copy.action === 'cancel_setup'
            ? 'Cancel'
            : null;

  return (
    <View
      className={`-mt-2 mb-4 mx-2 px-4 py-3 rounded-b-[20px] border border-t-0 ${
        isDark ? 'bg-white/[0.03] border-white/10' : 'bg-slate-50 border-slate-200'
      }`}
    >
      <View className="flex-row items-center">
        <Zap color={TONE_COLOUR[copy.tone]} size={16} />
        <View className="flex-1 ml-2.5 mr-2">
          <Text className="text-slate-900 dark:text-white font-inter-semibold text-[13px]">{copy.title}</Text>
          <Text className="text-slate-500 dark:text-white/50 font-inter text-xs mt-0.5 leading-4">
            {copy.detail}
          </Text>
        </View>
        {busy ? (
          <ActivityIndicator size="small" color={TONE_COLOUR[copy.tone]} />
        ) : actionLabel && !choosing ? (
          <Pressable
            onPress={onAction}
            className={`px-3 py-1.5 rounded-full border ${
              copy.action === 'turn_off' || copy.action === 'cancel_setup'
                ? 'border-slate-300 dark:border-white/15'
                : 'border-signal/40 bg-signal/15'
            }`}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <Text
              className={`font-inter-semibold text-xs ${
                copy.action === 'turn_off' || copy.action === 'cancel_setup'
                  ? 'text-slate-600 dark:text-white/70'
                  : 'text-signal-dim dark:text-signal-bright'
              }`}
            >
              {actionLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {choosing ? (
        <View className="mt-3">
          <Text className="text-slate-600 dark:text-white/70 font-inter text-xs leading-5 mb-2">
            1. Choose the most MiliPay may take from this account over the next year.{'\n'}
            2. On the next page, send ₦50 from this account to the account shown. That is how your bank knows it is you.{'\n'}
            3. Your bank switches it on, usually within a day. Then pay with just your fingerprint.
          </Text>

          <View className="flex-row gap-2 mb-2">
            {allowances.map((amount) => {
              const chosen = amount === allowance;
              return (
                <Pressable
                  key={amount}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setAllowance(amount);
                  }}
                  className={`flex-1 py-2 rounded-xl border items-center ${
                    chosen
                      ? 'border-signal bg-signal/15'
                      : 'border-slate-200 dark:border-white/10 bg-white dark:bg-white/5'
                  }`}
                >
                  <Text
                    className={`font-inter-bold text-xs ${
                      chosen ? 'text-signal-dim dark:text-signal-bright' : 'text-slate-700 dark:text-white/80'
                    }`}
                  >
                    {naira(amount)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text className="text-slate-400 dark:text-white/40 font-inter text-[11px] mb-3">
            Nothing is taken now. You can turn it off here at any time.
          </Text>

          <View className="flex-row gap-2">
            <Pressable
              onPress={() => setChoosing(false)}
              className="flex-1 h-11 rounded-xl items-center justify-center border border-slate-200 dark:border-white/10"
            >
              <Text className="text-slate-700 dark:text-white font-inter-semibold text-sm">Not now</Text>
            </Pressable>
            <Pressable
              disabled={busy || !allowance}
              onPress={() => setConfirming(true)}
              className={`flex-1 h-11 rounded-xl items-center justify-center bg-signal ${busy ? 'opacity-60' : ''}`}
            >
              <Text className="text-black font-inter-bold text-sm">Continue</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <ConfirmIdentitySheet
        visible={confirming}
        reason="Confirm it is you before turning on quick pay for this account."
        onConfirmed={() => {
          setConfirming(false);
          void start();
        }}
        onCancel={() => setConfirming(false)}
      />
    </View>
  );
}
