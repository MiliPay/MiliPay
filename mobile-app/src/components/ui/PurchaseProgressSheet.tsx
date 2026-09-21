import React from 'react';
import { View, Text, Modal, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, X, AlertTriangle, Clock } from 'lucide-react-native';

import {
  STATUS_COPY,
  isSuccess,
  isTerminal,
  progressStep,
  type TransactionSnapshot,
  type TransactionStatus,
} from '../../lib/transactionStatus';

/**
 * What the customer watches between putting their finger on the sensor and
 * the airtime landing.
 *
 * The honesty rule this screen exists to enforce: it never shows "Delivered"
 * until the operator has actually said so. Every step is a fact reported by
 * the server, not an animation we invented to fill the wait. A progress bar
 * that reaches 100% on a timer is how a customer is told they have airtime
 * they never received.
 */

interface Props {
  visible: boolean;
  snapshot: TransactionSnapshot | null;
  /** Shown above the steps, e.g. "MTN Airtime - 08031234567". */
  title: string;
  onClose: () => void;
  onViewReceipt?: () => void;
}

const STEPS: { key: ReturnType<typeof progressStep>; label: string }[] = [
  { key: 'paying', label: 'Confirming with your bank' },
  { key: 'paid', label: 'Payment confirmed' },
  { key: 'sending', label: 'Sending' },
  { key: 'done', label: 'Done' },
];

const ORDER: Record<string, number> = { paying: 0, paid: 1, sending: 2, done: 3 };

function StepRow({
  label,
  state,
}: {
  label: string;
  state: 'pending' | 'active' | 'complete' | 'failed';
}) {
  const colour =
    state === 'complete'
      ? 'rgba(16, 185, 129, 1)'
      : state === 'failed'
        ? 'rgba(239, 68, 68, 1)'
        : state === 'active'
          ? 'rgba(255,255,255,0.9)'
          : 'rgba(255,255,255,0.28)';

  return (
    <View className="flex-row items-center py-3">
      <View
        className="w-7 h-7 rounded-full items-center justify-center mr-4"
        style={{
          backgroundColor:
            state === 'complete'
              ? 'rgba(16,185,129,0.15)'
              : state === 'failed'
                ? 'rgba(239,68,68,0.15)'
                : 'rgba(255,255,255,0.06)',
        }}
      >
        {state === 'complete' ? (
          <Check size={16} color={colour} />
        ) : state === 'failed' ? (
          <X size={16} color={colour} />
        ) : state === 'active' ? (
          <ActivityIndicator size="small" color={colour} />
        ) : (
          <View className="w-2 h-2 rounded-full" style={{ backgroundColor: colour }} />
        )}
      </View>
      <Text className="font-inter-medium text-base" style={{ color: colour }}>
        {label}
      </Text>
    </View>
  );
}

export function PurchaseProgressSheet({
  visible,
  snapshot,
  title,
  onClose,
  onViewReceipt,
}: Props) {
  const status: TransactionStatus = snapshot?.status ?? 'initiated';
  const step = progressStep(status);
  const settled = isTerminal(status);
  const succeeded = isSuccess(status);

  // A terminal state that is not delivery failed somewhere. Which step failed
  // tells the customer whether their money moved at all.
  const failedAt =
    status === 'payment_failed' ? 'paying' : settled && !succeeded ? 'sending' : null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 bg-black/80">
        <SafeAreaView className="flex-1 justify-end">
          <View className="bg-zinc-950 rounded-t-3xl border-t border-white/10 pb-8">
            <View className="px-6 pt-6 pb-2">
              <Text className="text-white font-inter-bold text-xl">
                {succeeded ? 'Done' : settled ? 'Not completed' : 'Processing'}
              </Text>
              <Text className="text-white/50 font-inter text-sm mt-1">{title}</Text>
            </View>

            <View className="px-6 pt-2">
              {STEPS.map((s) => {
                const state =
                  failedAt === s.key
                    ? 'failed'
                    : ORDER[step] > ORDER[s.key] || (settled && succeeded)
                      ? 'complete'
                      : ORDER[step] === ORDER[s.key]
                        ? settled
                          ? succeeded
                            ? 'complete'
                            : 'failed'
                          : 'active'
                        : 'pending';
                return <StepRow key={s.key} label={s.label} state={state} />;
              })}
            </View>

            {/* The server's own words, not a guess made on the device. */}
            <View className="px-6 pt-3">
              <View
                className="rounded-2xl px-4 py-3 flex-row items-start"
                style={{
                  backgroundColor: succeeded
                    ? 'rgba(16,185,129,0.08)'
                    : settled
                      ? 'rgba(239,68,68,0.08)'
                      : 'rgba(255,255,255,0.04)',
                }}
              >
                {!settled && status === 'fulfilment_pending' ? (
                  <Clock size={16} color="rgba(255,255,255,0.6)" style={{ marginTop: 2 }} />
                ) : settled && !succeeded ? (
                  <AlertTriangle size={16} color="rgba(239,68,68,0.9)" style={{ marginTop: 2 }} />
                ) : null}
                <Text className="text-white/75 font-inter text-sm flex-1 ml-2">
                  {snapshot?.failureReason && settled && !succeeded
                    ? STATUS_COPY[status]
                    : STATUS_COPY[status]}
                </Text>
              </View>
            </View>

            {/* Electricity tokens are the whole point of the purchase, so they
                get their own block rather than being buried in a receipt. */}
            {snapshot?.token ? (
              <View className="px-6 pt-4">
                <Text className="text-white/40 font-inter text-xs uppercase tracking-wider">
                  Token
                </Text>
                <Text className="text-white font-inter-bold text-2xl tracking-widest mt-1">
                  {snapshot.token}
                </Text>
                {snapshot.units ? (
                  <Text className="text-white/50 font-inter text-sm mt-1">{snapshot.units}</Text>
                ) : null}
              </View>
            ) : null}

            {snapshot?.reference ? (
              <View className="px-6 pt-4">
                <Text className="text-white/30 font-inter text-xs">
                  Ref {snapshot.reference}
                </Text>
              </View>
            ) : null}

            <View className="px-6 pt-6">
              {settled ? (
                <View className="flex-row">
                  {succeeded && onViewReceipt ? (
                    <Pressable
                      onPress={onViewReceipt}
                      className="flex-1 bg-white/10 rounded-2xl py-4 items-center mr-3"
                    >
                      <Text className="text-white font-inter-semibold">Receipt</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={onClose}
                    className="flex-1 bg-emerald-500 rounded-2xl py-4 items-center"
                  >
                    <Text className="text-black font-inter-bold">Done</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  <Pressable
                    onPress={onClose}
                    className="bg-white/5 rounded-2xl py-4 items-center"
                  >
                    <Text className="text-white/60 font-inter-medium">Close</Text>
                  </Pressable>
                  {/* Closing must not read as cancelling. The money is already
                      moving and nothing on this phone can stop it. */}
                  <Text className="text-white/30 font-inter text-xs text-center mt-3">
                    This continues even if you close. You can check it in your history.
                  </Text>
                </>
              )}
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
