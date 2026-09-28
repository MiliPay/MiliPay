import React, { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { AlertTriangle, Check, CircleHelp, Clock, RefreshCw, Share2, X, type LucideIcon } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';

import { BottomSheet } from '../ds/BottomSheet';
import { useThemeColors } from '../../theme/useThemeColors';
import { brandFixed } from '../../theme/tokens';
import { feeLabel, naira2 } from '../../lib/purchaseForm';
import { isReturned, statusHeadline, type HeadlineIcon } from '../../lib/statusView';
import { STATUS_COPY, type TransactionStatus } from '../../lib/transactionStatus';
import { fullDateLabel, recipientLabel, txService } from '../../lib/activityView';
import { shareReceiptAsImage } from '../../lib/receiptSharing';
import type { AppTransaction } from '../../store/useStore';

const ICONS: Record<HeadlineIcon, LucideIcon> = { check: Check, x: X, alert: AlertTriangle, refresh: RefreshCw, clock: Clock };

/**
 * A transaction's details, from any list (design handoff: the `tx` sheet).
 * The headline follows the real status — only delivered is the green tick —
 * then the amount (struck through when it never left or came back), what the
 * status means, the electricity token, the details, and Get help / Share
 * receipt.
 */
export function TxDetailSheet({
  tx,
  accountLabel,
  onClose,
  onHelp,
}: {
  tx: AppTransaction | null;
  /** "GTBank ••6789", when the account is known. */
  accountLabel: string | null;
  onClose: () => void;
  onHelp: (tx: AppTransaction) => void;
}) {
  // The sheet keeps drawing the last transaction while it slides away.
  const last = useRef<AppTransaction | null>(tx);
  if (tx) last.current = tx;
  const shown = tx ?? last.current;

  return (
    <BottomSheet visible={!!tx} onClose={onClose}>
      {shown ? <TxDetail tx={shown} accountLabel={accountLabel} onClose={onClose} onHelp={onHelp} /> : null}
    </BottomSheet>
  );
}

function TxDetail({
  tx,
  accountLabel,
  onClose,
  onHelp,
}: {
  tx: AppTransaction;
  accountLabel: string | null;
  onClose: () => void;
  onHelp: (tx: AppTransaction) => void;
}) {
  const c = useThemeColors();
  const shotRef = useRef<View>(null);
  const [copied, setCopied] = useState(false);

  const headline = statusHeadline(tx.status);
  const Icon = ICONS[headline.icon];
  const returned = isReturned(tx.status);
  const palm = txService(tx) === 'palm';
  const copy =
    palm && tx.status === 'delivered' ? 'Paid with your palm' : STATUS_COPY[tx.status as TransactionStatus] ?? '';

  const [iconBg, iconFg, titleFg] =
    headline.tone === 'ok' ? ['#00C896', brandFixed.onBrand, c.brandText]
    : headline.tone === 'fail' ? [c.failSoft, c.fail, c.fail]
    : headline.tone === 'muted' ? [c.chip, c.muted, c.muted]
    : [c.warnSoft, c.warn, c.warn];

  const recipient = recipientLabel(tx);
  const rows: { k: string; v: string; brand?: boolean }[] = [
    { k: palm ? 'Merchant' : 'Service', v: tx.merchant_name || 'Payment' },
    ...(!palm && recipient ? [{ k: 'Recipient', v: recipient }] : []),
    ...(accountLabel ? [{ k: 'Paid from', v: accountLabel }] : []),
    // Older rows never recorded a fee; leave the row out rather than claim
    // one was free.
    ...(tx.fee_amount !== null && tx.fee_amount !== undefined
      ? [{ k: 'Fee', v: feeLabel(tx.fee_amount), brand: tx.fee_amount <= 0 }]
      : []),
    { k: 'Date', v: fullDateLabel(tx.created_at) },
    { k: 'Reference', v: tx.reference },
  ];

  const copyToken = async () => {
    if (!tx.token) return;
    await Clipboard.setStringAsync(tx.token);
    Haptics.selectionAsync().catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <View>
      <View ref={shotRef} collapsable={false} style={{ backgroundColor: c.sheet }}>
        <View style={{ alignItems: 'center', gap: 4 }}>
          <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: iconBg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon color={iconFg} size={28} strokeWidth={2.5} />
          </View>
          <Text accessibilityRole="header" style={{ marginTop: 10, color: titleFg, fontSize: 15, fontFamily: 'Inter_600SemiBold' }}>
            {headline.title}
          </Text>
          <Text
            style={{
              color: c.text,
              fontSize: 34,
              fontFamily: 'Inter_800ExtraBold',
              letterSpacing: -0.85,
              fontVariant: ['tabular-nums'],
              textDecorationLine: returned ? 'line-through' : 'none',
            }}
          >
            {naira2(tx.amount)}
          </Text>
          {copy ? (
            <Text style={{ color: c.muted, fontSize: 13, lineHeight: 18, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingHorizontal: 12 }}>
              {copy}
            </Text>
          ) : null}
        </View>

        {tx.token ? (
          <Pressable
            onPress={() => void copyToken()}
            accessibilityRole="button"
            accessibilityLabel="Recharge token. Tap to copy."
            style={{
              marginTop: 14,
              padding: 14,
              borderRadius: 18,
              borderWidth: 1.5,
              borderStyle: 'dashed',
              borderColor: c.brand,
              backgroundColor: c.brandSoft,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: c.brandText, fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.88, textTransform: 'uppercase' }}>
              Recharge token
            </Text>
            <Text selectable style={{ marginTop: 4, color: c.text, fontSize: 18, fontFamily: 'Inter_800ExtraBold', letterSpacing: 1.08, fontVariant: ['tabular-nums'] }}>
              {tx.token}
            </Text>
            <Text style={{ marginTop: 4, color: c.muted, fontSize: 12, fontFamily: 'Inter_500Medium' }}>
              {copied ? 'Copied' : tx.units ? `${tx.units} · Tap to copy` : 'Tap to copy'}
            </Text>
          </Pressable>
        ) : null}

        <View style={{ marginTop: 14, paddingHorizontal: 16, paddingVertical: 4, borderRadius: 18, backgroundColor: c.input }}>
          {rows.map((row, i) => (
            <View
              key={row.k}
              style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}
            >
              <Text style={{ color: c.muted, fontSize: 14, fontFamily: 'Inter_400Regular' }}>{row.k}</Text>
              <Text selectable style={{ flexShrink: 1, textAlign: 'right', color: row.brand ? c.brandText : c.text, fontSize: 14, fontFamily: 'Inter_600SemiBold' }}>
                {row.v}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        <Pressable
          onPress={() => onHelp(tx)}
          accessibilityRole="button"
          style={({ pressed }) => ({
            flex: 1,
            height: 50,
            borderRadius: 14,
            borderWidth: 1.5,
            borderColor: c.line,
            backgroundColor: pressed ? c.chip : 'transparent',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          })}
        >
          <CircleHelp color={c.text} size={17} />
          <Text style={{ color: c.text, fontSize: 14, fontFamily: 'Inter_600SemiBold' }}>Get help</Text>
        </Pressable>
        <Pressable
          onPress={() => void shareReceiptAsImage(shotRef)}
          accessibilityRole="button"
          style={({ pressed }) => ({
            flex: 1,
            height: 50,
            borderRadius: 14,
            backgroundColor: c.brand,
            opacity: pressed ? 0.85 : 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          })}
        >
          <Share2 color={brandFixed.onBrand} size={17} />
          <Text style={{ color: brandFixed.onBrand, fontSize: 14, fontFamily: 'Inter_700Bold' }}>Share receipt</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
        hitSlop={6}
        style={({ pressed }) => ({
          position: 'absolute',
          top: 0,
          right: 0,
          width: 34,
          height: 34,
          borderRadius: 17,
          backgroundColor: pressed ? c.line : c.chip,
          alignItems: 'center',
          justifyContent: 'center',
        })}
      >
        <X color={c.muted} size={18} />
      </Pressable>
    </View>
  );
}
