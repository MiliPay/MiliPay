import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { AlertTriangle, Check, Clock, Copy, FileText, RefreshCw, Share2, X, type LucideIcon } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';

import { Button } from '../../components/ds/Button';
import { EASE_OUT } from '../../components/ds/BottomSheet';
import { useThemeColors } from '../../theme/useThemeColors';
import { brandFixed } from '../../theme/tokens';
import { feeLabel, naira2, type ServiceKey } from '../../lib/purchaseForm';
import { isReturned, statusHeadline, type HeadlineIcon } from '../../lib/statusView';
import { shareReceiptAsImage, shareReceiptAsPdf } from '../../lib/receiptSharing';

export interface ReceiptParams {
  service: ServiceKey;
  reference: string;
  status: string;
  amount: number;
  fee: number;
  title: string;
  to: string;
  accountLabel: string;
  /** ISO timestamp. */
  date: string;
  token?: string | null;
  units?: string | null;
}

const ICONS: Record<HeadlineIcon, LucideIcon> = { check: Check, x: X, alert: AlertTriangle, refresh: RefreshCw, clock: Clock };

/**
 * The receipt (design handoff, screen 16): the headline follows the
 * purchase's real status — only a delivered purchase shows the green tick —
 * then the amount, what it was for, the 20-digit token for prepaid
 * electricity, the details, Share / Save PDF, Done and Buy again.
 */
export default function ReceiptScreen({ route, navigation }: any) {
  const c = useThemeColors();
  const r = route.params as ReceiptParams;
  const headline = statusHeadline(r.status);
  const Icon = ICONS[headline.icon];
  const returned = isReturned(r.status);
  const shotRef = useRef<View>(null);
  const [copied, setCopied] = useState(false);

  const [iconBg, iconFg, titleFg] =
    headline.tone === 'ok' ? ['#00C896', brandFixed.onBrand, c.brandText]
    : headline.tone === 'fail' ? [c.failSoft, c.fail, c.fail]
    : headline.tone === 'muted' ? [c.chip, c.muted, c.muted]
    : [c.warnSoft, c.warn, c.warn];

  // `pop`: .5 → 1.08 → 1 over 0.5 s.
  const scale = useSharedValue(0.5);
  const opacity = useSharedValue(0);
  useEffect(() => {
    opacity.value = withTiming(1, { duration: 250 });
    scale.value = withSequence(withTiming(1.08, { duration: 350, easing: EASE_OUT }), withTiming(1, { duration: 150, easing: EASE_OUT }));
  }, [opacity, scale]);
  const pop = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));

  const dateText = new Date(r.date).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
  const rows: { k: string; v: string; brand?: boolean }[] = [
    { k: 'Reference', v: r.reference },
    ...(r.accountLabel ? [{ k: 'Paid from', v: r.accountLabel }] : []),
    { k: 'Fee', v: feeLabel(r.fee), brand: r.fee <= 0 },
    { k: 'Date', v: dateText },
  ];

  const copyToken = async () => {
    if (!r.token) return;
    await Clipboard.setStringAsync(r.token);
    Haptics.selectionAsync().catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const pdf = () =>
    shareReceiptAsPdf({
      reference: r.reference,
      amount: r.amount,
      merchant: r.title,
      beneficiary: r.to,
      bank: r.accountLabel,
      date: dateText,
      token: r.token ?? null,
      units: r.units ?? null,
      status: r.status,
      fee: r.fee,
    });

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: 22, paddingHorizontal: 20, paddingBottom: 40 }}>
        <View ref={shotRef} collapsable={false} style={{ backgroundColor: c.bg, paddingBottom: 4 }}>
          <View style={{ alignItems: 'center', gap: 6 }}>
            <Animated.View style={[{ width: 84, height: 84, borderRadius: 42, backgroundColor: iconBg, alignItems: 'center', justifyContent: 'center' }, pop]}>
              <Icon color={iconFg} size={42} strokeWidth={3} />
            </Animated.View>
            <Text accessibilityRole="header" style={{ marginTop: 12, color: titleFg, fontSize: 15, fontFamily: 'Inter_600SemiBold' }}>
              {headline.title}
            </Text>
            <Text
              style={{
                color: returned ? c.faint : c.text,
                fontSize: 38,
                fontFamily: 'Inter_800ExtraBold',
                letterSpacing: -0.95,
                fontVariant: ['tabular-nums'],
                textDecorationLine: returned ? 'line-through' : 'none',
              }}
            >
              {naira2(r.amount)}
            </Text>
            <Text style={{ color: c.muted, fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center' }}>
              {r.title} · {r.to}
            </Text>
          </View>

          {r.token ? (
            <View
              style={{
                marginTop: 22,
                padding: 16,
                borderRadius: 20,
                borderWidth: 1.5,
                borderStyle: 'dashed',
                borderColor: c.brand,
                backgroundColor: c.brandSoft,
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Text style={{ color: c.brandText, fontSize: 12, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.96, textTransform: 'uppercase' }}>
                20-digit recharge token
              </Text>
              <Text selectable style={{ color: c.text, fontSize: 21, fontFamily: 'Inter_800ExtraBold', letterSpacing: 1.26, fontVariant: ['tabular-nums'] }}>
                {r.token}
              </Text>
              {r.units ? (
                <Text style={{ color: c.muted, fontSize: 13, fontFamily: 'Inter_400Regular' }}>Units credited: {r.units}</Text>
              ) : null}
              <Pressable
                onPress={() => void copyToken()}
                accessibilityRole="button"
                accessibilityLabel="Copy token"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 16, borderRadius: 12, backgroundColor: c.brand }}
              >
                {copied ? <Check color={brandFixed.onBrand} size={15} /> : <Copy color={brandFixed.onBrand} size={15} />}
                <Text style={{ color: brandFixed.onBrand, fontSize: 13, fontFamily: 'Inter_700Bold' }}>{copied ? 'Copied' : 'Copy token'}</Text>
              </Pressable>
            </View>
          ) : null}

          <View
            style={{
              marginTop: 18,
              paddingVertical: 4,
              paddingHorizontal: 16,
              backgroundColor: c.card,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: c.cardLine,
              boxShadow: c.shadow,
            }}
          >
            {rows.map((row, i) => (
              <View key={row.k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}>
                <Text style={{ color: c.muted, fontSize: 14, fontFamily: 'Inter_400Regular' }}>{row.k}</Text>
                <Text selectable style={{ flexShrink: 1, textAlign: 'right', color: row.brand ? c.brandText : c.text, fontSize: 14, fontFamily: 'Inter_600SemiBold' }}>
                  {row.v}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          <SecondaryButton icon={Share2} label="Share" onPress={() => void shareReceiptAsImage(shotRef)} />
          <SecondaryButton icon={FileText} label="Save PDF" onPress={() => void pdf()} />
        </View>
        <View style={{ marginTop: 10 }}>
          <Button label="Done" onPress={() => navigation.popToTop()} />
        </View>
        <Pressable
          onPress={() => navigation.replace('QuickService', { serviceType: r.service })}
          accessibilityRole="button"
          style={{ marginTop: 8, padding: 8, alignItems: 'center' }}
        >
          <Text style={{ color: c.brandText, fontSize: 14, fontFamily: 'Inter_600SemiBold' }}>Buy again</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function SecondaryButton({ icon: Icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  const c = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flex: 1,
        height: 50,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: c.line,
        backgroundColor: pressed ? c.chip : c.card,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
      })}
    >
      <Icon color={c.text} size={17} />
      <Text style={{ color: c.text, fontSize: 14, fontFamily: 'Inter_600SemiBold' }}>{label}</Text>
    </Pressable>
  );
}
