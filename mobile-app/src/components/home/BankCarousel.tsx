import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, Copy, Eye, EyeOff, Plus } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';

import { useThemeColors } from '../../theme/useThemeColors';
import { bankCardTheme } from '../../theme/tokens';
import { balanceCaption } from '../../lib/activityView';
import type { LinkedAccount } from '../../store/useStore';

export const CARD_WIDTH = 326;
export const CARD_HEIGHT = 200;
const GAP = 12;
const STEP = CARD_WIDTH + GAP;
/** The prototype links at most three accounts. */
export const MAX_LINKED = 3;

/**
 * The swipeable linked-bank cards on Home (design handoff, screen 5): 326×200,
 * radius 26, a bank-specific gradient, snapping one card at a time. The
 * chosen card wears "Paying from" — purchases default to it. A dashed "Link
 * bank account" card comes last while fewer than three are linked, and page
 * dots sit underneath, the active one wider.
 */
export function BankCarousel({
  accounts,
  activeIndex,
  onSelect,
  onLink,
}: {
  accounts: LinkedAccount[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onLink: () => void;
}) {
  const c = useThemeColors();
  const scroller = useRef<ScrollView>(null);
  const [hidden, setHidden] = useState(true);
  const canLink = accounts.length < MAX_LINKED;
  const pages = accounts.length + (canLink ? 1 : 0);
  const [page, setPage] = useState(activeIndex);

  // Keep the scroll position on the chosen card when it changes from outside
  // (a dot tapped, an account unlinked).
  useEffect(() => {
    setPage(activeIndex);
    scroller.current?.scrollTo({ x: activeIndex * STEP, animated: true });
  }, [activeIndex]);

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.max(0, Math.min(pages - 1, Math.round(e.nativeEvent.contentOffset.x / STEP)));
    setPage(index);
    if (index < accounts.length && index !== activeIndex) {
      Haptics.selectionAsync().catch(() => {});
      onSelect(index);
    }
  };

  const goTo = (index: number) => {
    setPage(index);
    scroller.current?.scrollTo({ x: index * STEP, animated: true });
    if (index < accounts.length && index !== activeIndex) onSelect(index);
  };

  return (
    <View>
      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={STEP}
        decelerationRate="fast"
        disableIntervalMomentum
        onMomentumScrollEnd={onScrollEnd}
        contentContainerStyle={{ gap: GAP, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 4 }}
      >
        {accounts.map((account, i) => (
          <BankCard
            key={account.id}
            account={account}
            index={i}
            active={i === activeIndex}
            hidden={hidden}
            onToggleHidden={() => setHidden((h) => !h)}
            onPress={() => goTo(i)}
          />
        ))}
        {canLink ? (
          <Pressable
            onPress={onLink}
            accessibilityRole="button"
            accessibilityLabel="Link bank account"
            style={({ pressed }) => ({
              width: CARD_WIDTH,
              height: CARD_HEIGHT,
              borderRadius: 26,
              borderWidth: 1.5,
              borderStyle: 'dashed',
              borderColor: c.line,
              backgroundColor: pressed ? c.chip : c.card,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            })}
          >
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: c.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Plus color={c.brand} size={26} />
            </View>
            <Text style={{ color: c.text, fontSize: 17, fontFamily: 'Inter_700Bold' }}>Link bank account</Text>
            <Text style={{ color: c.muted, fontSize: 13, fontFamily: 'Inter_400Regular' }}>Connect another account to pay with.</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      {pages > 1 ? (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 10 }}>
          {Array.from({ length: pages }, (_, i) => (
            <Pressable
              key={i}
              onPress={() => goTo(i)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={i < accounts.length ? `Card ${i + 1} of ${accounts.length}` : 'Link bank account'}
              style={{ height: 6, borderRadius: 3, width: i === page ? 22 : 6, backgroundColor: i === page ? c.brand : c.line }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function BankCard({
  account,
  index,
  active,
  hidden,
  onToggleHidden,
  onPress,
}: {
  account: LinkedAccount;
  index: number;
  active: boolean;
  hidden: boolean;
  onToggleHidden: () => void;
  onPress: () => void;
}) {
  const theme = bankCardTheme(index);
  const [copied, setCopied] = useState(false);

  const copyNumber = async () => {
    await Clipboard.setStringAsync(account.accountNumber);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={`${account.bankName}, ${account.accountName}${active ? ', paying from this account' : ''}`}
      style={{ width: CARD_WIDTH, height: CARD_HEIGHT, borderRadius: 26, boxShadow: `0px 12px 28px -12px ${theme.shadow}` }}
    >
      <LinearGradient
        colors={theme.gradient as unknown as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1, borderRadius: 26, overflow: 'hidden', paddingTop: 20, paddingHorizontal: 20, paddingBottom: 18, justifyContent: 'space-between' }}
      >
        <View style={{ position: 'absolute', right: -70, top: -90, width: 240, height: 240, borderRadius: 120, backgroundColor: 'rgba(255,255,255,0.07)' }} />
        <View style={{ position: 'absolute', right: -20, top: -40, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.06)' }} />

        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text numberOfLines={1} style={{ flexShrink: 1, color: 'rgba(255,255,255,0.85)', fontSize: 12, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.44, textTransform: 'uppercase' }}>
              {account.bankName}
            </Text>
            {active ? (
              <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.16)' }}>
                <Text style={{ color: theme.accent, fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.8, textTransform: 'uppercase' }}>Paying from</Text>
              </View>
            ) : null}
          </View>
          <Text numberOfLines={1} style={{ color: '#FFFFFF', fontSize: 16, fontFamily: 'Inter_600SemiBold' }}>
            {account.accountName}
          </Text>
        </View>

        <View>
          <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, fontFamily: 'Inter_400Regular' }}>
            {balanceCaption(account.balanceAsOf)}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
            <Text style={{ color: '#FFFFFF', fontSize: 31, fontFamily: 'Inter_800ExtraBold', letterSpacing: -0.62, fontVariant: ['tabular-nums'] }}>
              {hidden ? '₦ ••••••' : account.balance}
            </Text>
            <Pressable
              onPress={onToggleHidden}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={hidden ? 'Show balance' : 'Hide balance'}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' }}
            >
              {hidden ? <EyeOff color="#FFFFFF" size={18} /> : <Eye color="#FFFFFF" size={18} />}
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, fontFamily: 'Inter_400Regular' }}>Acct no.</Text>
            <Text style={{ color: '#FFFFFF', fontSize: 14, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.84, fontVariant: ['tabular-nums'] }}>
              {account.accountNumber}
            </Text>
            <Pressable
              onPress={() => void copyNumber()}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Copy account number"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.14)' }}
            >
              {copied ? <Check color={theme.accent} size={13} /> : <Copy color="#FFFFFF" size={13} />}
              <Text style={{ color: copied ? theme.accent : '#FFFFFF', fontSize: 11, fontFamily: 'Inter_600SemiBold' }}>{copied ? 'Copied' : 'Copy'}</Text>
            </Pressable>
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}
