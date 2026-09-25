import React from 'react';
import { View, Text } from 'react-native';
import { Check, Clock, X } from 'lucide-react-native';
import { colors } from '../../theme/tokens';
import { receiptHeadline } from '../../lib/receiptHeadline';

/**
 * The top of an in-app receipt: icon, headline, amount, one line of detail.
 *
 * Both receipts used to draw a green tick and "Payment Successful!" whatever
 * the transaction's status, so a payment that never went through was shown
 * as a success. Everything here follows receiptHeadline(), which the PDF
 * receipt uses too.
 */
const TONE = {
  ok: { ring: 'rgba(0, 200, 150, 0.15)', dot: colors.signal.base, icon: '#000000' },
  pending: { ring: 'rgba(255, 180, 84, 0.15)', dot: colors.status.warn, icon: '#000000' },
  bad: { ring: 'rgba(255, 92, 92, 0.15)', dot: colors.status.fail, icon: '#FFFFFF' },
} as const;

export default function ReceiptHeadline({
  status,
  amount,
}: {
  status: string | null | undefined;
  amount: number;
}) {
  const headline = receiptHeadline(status);
  const tone = TONE[headline.tone];
  const Icon = headline.tone === 'ok' ? Check : headline.tone === 'pending' ? Clock : X;
  const naira = `₦${Number(amount || 0).toLocaleString()}`;

  return (
    <View className="items-center w-full">
      <View
        className="w-20 h-20 rounded-full items-center justify-center mb-3"
        style={{ backgroundColor: tone.ring }}
      >
        <View
          className="w-14 h-14 rounded-full items-center justify-center"
          style={{
            backgroundColor: tone.dot,
            shadowColor: tone.dot,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.35,
            shadowRadius: 8,
            elevation: 6,
          }}
        >
          <Icon color={tone.icon} size={28} strokeWidth={3.5} />
        </View>
      </View>

      <Text className="text-slate-900 dark:text-white font-inter-bold text-2xl text-center mb-1 tracking-tight">
        {headline.title}
      </Text>

      {/* Struck through when the money never left the customer, or came back:
          a failed or refunded payment must not read as a debit. */}
      <Text
        className={`font-inter-bold text-3xl ${headline.detail ? 'mb-1' : 'mb-4'} ${
          headline.tone === 'ok' ? 'text-signal-dim dark:text-signal-bright' : 'text-slate-900 dark:text-white'
        }`}
        style={headline.charged ? undefined : { textDecorationLine: 'line-through', opacity: 0.6 }}
      >
        {naira}
      </Text>

      {headline.detail ? (
        <Text className="text-slate-500 dark:text-zinc-400 font-inter text-sm text-center mb-4">
          {headline.detail}
        </Text>
      ) : null}
    </View>
  );
}
