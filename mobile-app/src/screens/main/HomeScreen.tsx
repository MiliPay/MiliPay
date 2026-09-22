import React, { useState, useEffect, useRef } from 'react';
import { useColorScheme } from 'nativewind';
import { View, Text, ScrollView, Dimensions, Pressable, Modal, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { 
  useAnimatedScrollHandler, 
  useSharedValue, 
  useAnimatedStyle, 
  interpolate, 
  Extrapolation,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { 
  Eye, EyeOff, Smartphone, Wifi, Zap, ArrowDownLeft, ArrowUpRight, MoreHorizontal, Lightbulb, Tv, Copy, CheckCheck, Plus,
  Globe, Bus, GraduationCap, Droplet, Plane, HeartPulse, Ticket, Landmark, X, Check, Share2, FileText, CreditCard
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';

import { MonoProvider, useMonoConnect } from '@mono.co/connect-react-native';

import { ConfirmIdentitySheet } from '../../components/ui/ConfirmIdentitySheet';
import { useBankStore, useAuthStore, useTransactionStore, LinkedAccount } from '../../store/useStore';
import { AVAILABLE_SERVICES, SERVICE_GROUPS, SERVICE_TILES, type ServiceTile, type ServiceType } from '../../lib/services';
import { colors } from '../../theme/tokens';
import { shareReceiptAsPdf, shareReceiptAsImage } from '../../lib/receiptSharing';
import { isMoneyReturned, rowStatus } from '../../lib/transactionStatus';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width * 0.90;
const SNAP_INTERVAL = CARD_WIDTH + 16;

const CARD_THEMES = [
  {
    gradient: ['#065f46', '#022c22'] as [string, string],
    bg: '#064e3b',
    accent: '#33E0B5',
    badgeBg: 'rgba(51, 224, 181, 0.25)',
    badgeBorder: 'rgba(51, 224, 181, 0.5)',
    badgeText: '#33E0B5',
    shadow: '#065f46',
  },
  {
    gradient: ['#1e40af', '#0f172a'] as [string, string],
    bg: '#1e3a8a',
    accent: '#60a5fa',
    badgeBg: 'rgba(96, 165, 250, 0.25)',
    badgeBorder: 'rgba(96, 165, 250, 0.5)',
    badgeText: '#60a5fa',
    shadow: '#1e40af',
  },
  {
    gradient: ['#831843', '#4a044e'] as [string, string],
    bg: '#831843',
    accent: '#f472b6',
    badgeBg: 'rgba(244, 114, 182, 0.25)',
    badgeBorder: 'rgba(244, 114, 182, 0.5)',
    badgeText: '#f472b6',
    shadow: '#831843',
  },
];

const LinkBankCard = ({ index, scrollX, isDark }: any) => {
  const { init } = useMonoConnect();
  const { linkedAccounts } = useBankStore();
  const user = useAuthStore((state) => state.user);
  const [isConfirming, setIsConfirming] = useState(false);

  /**
   * Mono ties the connection — and any Direct Debit mandate signed against it —
   * to the name and email we hand over. Refusing to link is recoverable;
   * linking a real bank account under a placeholder identity is not.
   */
  const hasCompleteIdentity = Boolean(
    user?.email?.trim() && user?.firstName?.trim() && user.firstName !== 'User',
  );

  /**
   * Linking a bank account is a sensitive action, so it is gated on the device
   * fingerprint with the MiliPay PIN as the fallback. Previously this called
   * Mono's widget straight away, so anyone holding an unlocked handset could
   * attach an account.
   */
  const handleLinkPress = () => {
    if (linkedAccounts.length >= 3) {
      Alert.alert(
        "Limit reached",
        "You can link up to 3 bank accounts. Remove one to link another."
      );
      return;
    }
    if (!hasCompleteIdentity) {
      Alert.alert(
        "We need your details first",
        "Your bank has to match this account to your full name and email address, and we do not have both on file. Contact support or the agent who enrolled you, then try again."
      );
      return;
    }
    setIsConfirming(true);
  };

  const handleConfirmed = () => {
    setIsConfirming(false);
    init();
  };

  const inputRange = [
    (index - 1) * SNAP_INTERVAL,
    index * SNAP_INTERVAL,
    (index + 1) * SNAP_INTERVAL,
  ];

  const animatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(scrollX.value, inputRange, [0.9, 1, 0.9], Extrapolation.CLAMP);
    const opacity = interpolate(scrollX.value, inputRange, [0.5, 1, 0.5], Extrapolation.CLAMP);
    return { transform: [{ scale }], opacity };
  });

  return (
    <Animated.View style={[animatedStyle, { width: CARD_WIDTH, marginHorizontal: 8 }]}>
      <Pressable 
        onPress={handleLinkPress}
        className={`rounded-3xl overflow-hidden h-56 border border-dashed items-center justify-center ${
          isDark 
            ? 'border-white/15 bg-white/5 active:bg-white/10' 
            : 'border-slate-300 bg-white shadow-sm active:bg-slate-50'
        }`}
      >
        <View className="w-16 h-16 rounded-full bg-signal/10 dark:bg-signal/20 border border-signal/25 dark:border-signal/40 items-center justify-center mb-4">
          <Plus color="#00C896" size={32} />
        </View>
        <Text className="text-slate-900 dark:text-white font-inter-bold text-xl mb-1">Link Bank Account</Text>
        <Text className="text-slate-500 dark:text-white/60 font-inter text-sm text-center px-8">Connect another account to pay with.</Text>
      </Pressable>

      <ConfirmIdentitySheet
        visible={isConfirming}
        reason="Confirm it is you before linking a bank account to MiliPay."
        onConfirmed={handleConfirmed}
        onCancel={() => setIsConfirming(false)}
      />
    </Animated.View>
  );
};

const ActiveBankCard = ({ item, index, scrollX, isBalanceHidden, toggleBalance, isActive, isDark }: any) => {
  const [isCopied, setIsCopied] = useState(false);
  const theme = CARD_THEMES[index % CARD_THEMES.length];
  
  const inputRange = [
    (index - 1) * SNAP_INTERVAL,
    index * SNAP_INTERVAL,
    (index + 1) * SNAP_INTERVAL,
  ];

  const animatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(scrollX.value, inputRange, [0.9, 1, 0.9], Extrapolation.CLAMP);
    const opacity = interpolate(scrollX.value, inputRange, [0.5, 1, 0.5], Extrapolation.CLAMP);
    return {
      transform: [{ scale }],
      opacity,
    };
  });

  return (
    <Animated.View style={[animatedStyle, { width: CARD_WIDTH, marginHorizontal: 8 }]}>
      <View 
        className={`rounded-3xl overflow-hidden h-56 border ${isDark ? 'border-white/15' : 'border-black/5'}`}
        style={{
          backgroundColor: theme.bg,
          shadowColor: theme.shadow,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: isDark ? 0.35 : 0.22,
          shadowRadius: 16,
          elevation: 8,
        }}
      >
        {/* Base rich gradient */}
        <LinearGradient
          colors={theme.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        
        {/* Subtle glass reflection overlay */}
        <LinearGradient
          colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0.01)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.7, y: 0.7 }}
          style={StyleSheet.absoluteFill}
        />
        
        <View className="p-6 flex-1 justify-between">
          <View className="flex-row justify-between items-start">
            <View className="flex-1 pr-4">
              <View className="flex-row items-center mb-1">
                <Text className="text-white/80 font-inter-semibold uppercase tracking-widest text-xs mr-3">
                  {item.bankName}
                </Text>
                {isActive && (
                  <View 
                    className="px-2 py-0.5 rounded-full border"
                    style={{ backgroundColor: theme.badgeBg, borderColor: theme.badgeBorder }}
                  >
                    <Text 
                      className="font-inter-bold text-[8px] uppercase tracking-widest"
                      style={{ color: theme.badgeText }}
                    >
                      Active Link
                    </Text>
                  </View>
                )}
              </View>
              <Text className="text-white font-inter-bold text-lg" numberOfLines={1}>
                {item.accountName}
              </Text>
            </View>
            <View className="w-10 h-10 rounded-full bg-white/15 items-center justify-center border border-white/20">
              <Zap color="#33E0B5" size={20} />
            </View>
          </View>
          
          <View>
            <Text className="text-white/70 font-inter-medium uppercase tracking-widest text-xs mb-1">
              Available Balance
            </Text>
            <View className="flex-row items-center justify-between">
              <Text className="text-white font-mono-bold text-3xl tracking-tight">
                {isBalanceHidden ? '••••••••' : item.balance}
              </Text>
              <Pressable 
                onPress={toggleBalance} 
                className="p-2 -mr-2 bg-white/15 rounded-full active:bg-white/25 border border-white/10"
              >
                {isBalanceHidden ? <EyeOff color="#fff" size={18} /> : <Eye color="#fff" size={18} />}
              </Pressable>
            </View>
          </View>

          <View className="flex-row items-center justify-between pt-1">
            <View className="flex-row items-center">
              <Text className="text-white/70 font-inter-medium uppercase tracking-widest text-xs mr-2">
                Account No:
              </Text>
              <Text className="text-white font-mono-bold text-sm mr-2 tracking-wider">
                {item.accountNumber}
              </Text>
              <Pressable 
                onPress={async () => {
                  await Clipboard.setStringAsync(item.accountNumber);
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  setIsCopied(true);
                  setTimeout(() => setIsCopied(false), 2000);
                }}
                className="p-1.5 rounded-lg bg-white/15 active:bg-white/25 border border-white/15 flex-row items-center"
              >
                {isCopied ? (
                  <>
                    <CheckCheck color="#33E0B5" size={14} />
                    <Text className="text-signal-bright font-inter-semibold text-[10px] ml-1 uppercase">Copied</Text>
                  </>
                ) : (
                  <Copy color="#fff" size={14} />
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Animated.View>
  );
};

const BankNode = ({ item, index, scrollX, isBalanceHidden, toggleBalance, isActive, onPress }: any) => {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme !== 'light';

  if (item.isLinkCard) {
    return <LinkBankCard index={index} scrollX={scrollX} isDark={isDark} />;
  }

  return (
    <Pressable onPress={onPress}>
      <ActiveBankCard 
        item={item} 
        index={index} 
        scrollX={scrollX} 
        isBalanceHidden={isBalanceHidden} 
        toggleBalance={toggleBalance} 
        isActive={isActive} 
        isDark={isDark} 
      />
    </Pressable>
  );
};

/**
 * One service tile. Every available service wears the same brand green:
 * twelve different accent colours made the grid read as decoration rather
 * than a set of things you can do. Unavailable services are visibly muted
 * and carry a `Soon` pill, and they do not navigate.
 */
const ServiceTileButton = ({
  tile,
  width,
  onPress,
}: {
  tile: ServiceTile;
  width: string;
  onPress?: () => void;
}) => {
  const Icon = tile.icon;
  const available = tile.service !== null;
  return (
    <Pressable
      onPress={available ? onPress : undefined}
      disabled={!available}
      className={`items-center ${width} mb-5 ${available ? 'active:opacity-70' : ''}`}
    >
      <View
        className={`w-14 h-14 rounded-2xl items-center justify-center mb-2 ${
          available
            ? 'bg-signal/15'
            : 'bg-black/[0.04] dark:bg-white/[0.06]'
        }`}
      >
        <Icon color={available ? colors.signal.base : colors.ink.faint} size={23} />
      </View>
      <Text
        numberOfLines={1}
        className={`font-inter text-[11px] text-center ${
          available ? 'text-slate-600 dark:text-white/70' : 'text-slate-400 dark:text-white/35'
        }`}
      >
        {tile.label}
      </Text>
      {!available && (
        <Text className="font-inter-medium text-[9px] text-slate-400 dark:text-white/30 mt-0.5">
          Soon
        </Text>
      )}
    </Pressable>
  );
};

function HomeScreenContent({ navigation }: any) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme !== 'light';

  const user = useAuthStore((state) => state.user);
  const { linkedAccounts, activeBankIndex, isLoading, fetchAccounts, setActiveBankIndex } = useBankStore();
  const { transactions, fetchTransactions, subscribeToLive } = useTransactionStore();
  
  const [isBalanceHidden, setIsBalanceHidden] = useState(true);
  const [isMoreServicesVisible, setIsMoreServicesVisible] = useState(false);
  const carouselRef = useRef<any>(null);

  // Receipt Modal State
  const [selectedTx, setSelectedTx] = useState<any | null>(null);
  const [isSharingPdf, setIsSharingPdf] = useState(false);
  const [isSharingImage, setIsSharingImage] = useState(false);
  const [hasCopiedRef, setHasCopiedRef] = useState(false);
  const [copiedTokenId, setCopiedTokenId] = useState<string | null>(null);
  const txReceiptRef = useRef<View>(null);

  const activeAccount = linkedAccounts && linkedAccounts.length > 0 
    ? linkedAccounts[activeBankIndex] || linkedAccounts[0] 
    : undefined;

  const isTxFromAccount = (tx: any, account: any) => {
    if (!account) return true;
    if (!tx.account_used) return false;
    if (tx.account_used === account.id) return true;

    const accountUsedLower = String(tx.account_used).toLowerCase();
    const bankNameLower = String(account.bankName).toLowerCase();
    const last4 = String(account.accountNumber).slice(-4);

    if (accountUsedLower.includes(bankNameLower)) return true;
    if (accountUsedLower.includes(last4)) return true;

    return false;
  };

  const filteredRecentTransactions = activeAccount
    ? transactions.filter((t) => isTxFromAccount(t, activeAccount))
    : transactions;

  const formatTxDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

    if (isToday) return `Today, ${timeStr}`;
    if (isYesterday) return `Yesterday`;
    return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${timeStr}`;
  };

  const getAccountLabel = (accountUsed?: string | null) => {
    if (!accountUsed) return null;
    const match = linkedAccounts.find((a) => a.id === accountUsed);
    if (match) {
      return `${match.bankName} (****${match.accountNumber.slice(-4)})`;
    }
    if (accountUsed.includes('(') || accountUsed.length < 30) {
      return accountUsed;
    }
    return 'Linked Bank Account';
  };

  const getTransactionIcon = (name?: string) => {
    const lower = (name || '').toLowerCase();
    if (lower.includes('airtime') || lower.includes('mtn') || lower.includes('glo') || lower.includes('airtel') || lower.includes('9mobile')) {
      return <Smartphone color="#00C896" size={18} />;
    }
    if (lower.includes('data')) {
      return <Wifi color="#3b82f6" size={18} />;
    }
    if (lower.includes('electric') || lower.includes('power') || lower.includes('ikedc') || lower.includes('ekedc') || lower.includes('aedc')) {
      return <Lightbulb color="#f97316" size={18} />;
    }
    if (lower.includes('dstv') || lower.includes('gotv') || lower.includes('cable') || lower.includes('startimes')) {
      return <Tv color="#a855f7" size={18} />;
    }
    return <Zap color="#00C896" size={18} />;
  };

  const copyToken = async (id: string, token: string) => {
    await Clipboard.setStringAsync(token);
    Haptics.selectionAsync();
    setCopiedTokenId(id);
    setTimeout(() => setCopiedTokenId(null), 3000);
  };

  const handleShareSelectedPdf = async () => {
    if (!selectedTx) return;
    try {
      setIsSharingPdf(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const formattedDate = new Date(selectedTx.created_at).toLocaleString('en-NG', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
      await shareReceiptAsPdf({
        reference: selectedTx.reference || `MP-TXN-${selectedTx.id.slice(0, 8)}`,
        amount: Number(selectedTx.amount),
        merchant: selectedTx.merchant_name || 'MiliPay Transaction',
        beneficiary: selectedTx.recipient || selectedTx.merchant_name || 'Direct Service',
        bank: getAccountLabel(selectedTx.account_used) || 'MiliPay Linked Account',
        date: formattedDate,
        token: selectedTx.token,
        status: selectedTx.status,
      });
    } finally {
      setIsSharingPdf(false);
    }
  };

  const handleShareSelectedImage = async () => {
    if (!txReceiptRef.current) return;
    try {
      setIsSharingImage(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await shareReceiptAsImage(txReceiptRef);
    } finally {
      setIsSharingImage(false);
    }
  };

  const handleCopyReference = async (ref: string) => {
    await Clipboard.setStringAsync(ref);
    Haptics.selectionAsync();
    setHasCopiedRef(true);
    setTimeout(() => setHasCopiedRef(false), 3000);
  };

  useEffect(() => {
    if (!user?.id) return;

    fetchAccounts(user.id);
    fetchTransactions(user.id, user.customerId);

    // Live history and live balance. A purchase settles asynchronously now —
    // the bank confirms by webhook and the airtime follows — so a transaction
    // really does change state while this screen is open. Without the
    // subscription it would sit on "Confirming with your bank" until a manual
    // refresh, which reads as a stuck payment.
    //
    // Subscribed here rather than in each screen so there is one channel per
    // session, not one per mount.
    const unsubscribe = subscribeToLive(user.id);
    return unsubscribe;
  }, [user?.id, user?.customerId]);

  // `null` is a service we cannot deliver yet. The tile is already disabled, so
  // this is the second lock rather than the first: nothing can navigate to a
  // purchase screen for a service the server would reject.
  const handleOpenService = (serviceType: ServiceType | null) => {
    if (!serviceType) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsMoreServicesVisible(false);
    navigation.navigate('QuickService', { serviceType });
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning,';
    if (hour < 18) return 'Good afternoon,';
    return 'Welcome back,';
  };
  
  const scrollX = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });

  const handleSelectBank = (index: number) => {
    if (index < linkedAccounts.length) {
      Haptics.selectionAsync();
      setActiveBankIndex(index);
      carouselRef.current?.scrollTo({ x: index * SNAP_INTERVAL, animated: true });
    }
  };

  const handleScrollEnd = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.max(0, Math.min(Math.round(offsetX / SNAP_INTERVAL), linkedAccounts.length - 1));
    if (index !== activeBankIndex && index < linkedAccounts.length) {
      Haptics.selectionAsync();
      setActiveBankIndex(index);
    }
  };

  const maxReached = linkedAccounts.length >= 3;
  const carouselData = maxReached 
    ? [...linkedAccounts] 
    : [...linkedAccounts, { isLinkCard: true, id: 'link-card' }];

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-black">
      <LinearGradient colors={isDark ? ['rgba(0, 200, 150, 0.08)', '#000'] : ['rgba(0, 200, 150, 0.08)', '#f8fafc']} className="absolute inset-0" />
      
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="px-6 pt-2 pb-6 flex-row items-center justify-between">
          <View>
            <View className="flex-row items-center mb-1">
              <Text className="text-slate-900 dark:text-white font-inter-bold text-base tracking-wide">
                {getGreeting()}
              </Text>
            </View>
            <Text className="text-slate-900 dark:text-white text-3xl font-inter-bold tracking-tight">
              {user?.firstName || 'User'}
            </Text>
          </View>
          <Pressable 
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate('ProfileSettings');
            }}
            className="w-12 h-12 rounded-full bg-black/5 dark:bg-white/10 items-center justify-center border border-slate-200 dark:border-white/10"
          >
            <Text className="text-slate-900 dark:text-white font-inter-bold">{user?.initials || 'ME'}</Text>
          </Pressable>
        </View>

        {/* Carousel */}
        <View className="mb-8">
          <View className="h-64 justify-center">
            {isLoading && linkedAccounts.length === 0 ? (
              <View className="flex-1 justify-center items-center">
                <ActivityIndicator color="#00C896" />
              </View>
            ) : (
              <Animated.ScrollView
                ref={carouselRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={SNAP_INTERVAL}
                decelerationRate="fast"
                onScroll={scrollHandler}
                onMomentumScrollEnd={handleScrollEnd}
                onScrollEndDrag={handleScrollEnd}
                scrollEventThrottle={16}
                contentContainerStyle={{ paddingHorizontal: (width - CARD_WIDTH) / 2 - 8 }}
              >
                {carouselData.map((item: any, index: number) => (
                  <BankNode 
                    key={item.id}
                    item={item}
                    index={index}
                    scrollX={scrollX}
                    isBalanceHidden={isBalanceHidden}
                    toggleBalance={() => setIsBalanceHidden(!isBalanceHidden)}
                    isActive={index === activeBankIndex && !item.isLinkCard}
                    onPress={() => handleSelectBank(index)}
                  />
                ))}
              </Animated.ScrollView>
            )}
          </View>

          {/* Indicator Dots */}
          {linkedAccounts.length > 1 && (
            <View className="flex-row justify-center items-center mt-3 gap-1.5">
              {linkedAccounts.map((_, idx) => (
                <Pressable
                  key={`dot-${idx}`}
                  onPress={() => handleSelectBank(idx)}
                  className={`h-2 rounded-full transition-all ${
                    idx === activeBankIndex 
                      ? 'w-6 bg-signal' 
                      : 'w-2 bg-slate-300 dark:bg-zinc-700'
                  }`}
                />
              ))}
            </View>
          )}
        </View>

        {/* Quick Services */}
        <View className="px-6 mb-8">
          <Text className="text-slate-500 dark:text-white/60 font-inter-bold uppercase tracking-widest text-xs mb-4">
            Quick Services
          </Text>
          <View className="flex-row justify-between">
            {AVAILABLE_SERVICES.map((tile) => (
              <ServiceTileButton
                key={tile.key}
                tile={tile}
                width="w-[22%]"
                onPress={() => handleOpenService(tile.service)}
              />
            ))}
          </View>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setIsMoreServicesVisible(true);
            }}
            className="flex-row items-center justify-center py-3 rounded-2xl border border-slate-200 dark:border-white/10 active:opacity-60"
          >
            <Text className="text-slate-600 dark:text-white/70 font-inter-medium text-[13px]">
              View all services
            </Text>
            <MoreHorizontal
              color={isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)'}
              size={16}
              style={{ marginLeft: 6 }}
            />
          </Pressable>
        </View>

        {/* Recent Transactions */}
        <View className="px-6 mb-3 flex-row items-center justify-between">
          <Text className="text-slate-500 dark:text-white/60 font-inter-bold uppercase tracking-widest text-xs">
            Recent Transactions
          </Text>
          <Pressable 
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate('Transactions');
            }} 
            className="px-3.5 py-1.5 rounded-full bg-black/5 dark:bg-white/10 border border-slate-200 dark:border-white/10 active:opacity-60"
          >
            <Text className="text-slate-900 dark:text-white font-inter-medium text-xs">View All</Text>
          </Pressable>
        </View>
        
        {filteredRecentTransactions.length === 0 ? (
          <View className="px-6 pb-12 items-center justify-center py-8">
            <View className="w-14 h-14 rounded-full bg-black/5 dark:bg-white/10 items-center justify-center mb-3">
              <ArrowDownLeft color={isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)"} size={22} />
            </View>
            <Text className="text-slate-800 dark:text-zinc-200 font-inter-semibold text-sm text-center">
              No recent transactions
            </Text>
            <Text className="text-slate-400 dark:text-zinc-500 font-inter text-xs text-center mt-1 px-4">
              When you make payments or top-ups, they will appear here.
            </Text>
          </View>
        ) : (
          <View className="px-5 pb-12">
            {filteredRecentTransactions.slice(0, 5).map((item) => {
              const isCredit = item.category === 'received' || item.type === 'credit' || item.direction === 'inflow';
              const badge = rowStatus(item.status);
              const returned = isMoneyReturned(item.status);
              return (
                <Pressable 
                  key={item.id}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedTx(item);
                  }}
                  className="flex-row items-center justify-between py-3.5 px-2 rounded-2xl active:opacity-60"
                >
                  <View className="flex-row items-center flex-1 mr-3">
                    {/* Circle Icon: Red ↗ for debit, Green ↙ for credit */}
                    <View className={`w-11 h-11 rounded-full items-center justify-center mr-3.5 ${
                      isCredit 
                        ? 'bg-signal/15 dark:bg-signal/20' 
                        : 'bg-rose-500/15 dark:bg-rose-500/20'
                    }`}>
                      {isCredit ? (
                        <ArrowDownLeft color="#00C896" size={18} strokeWidth={2.5} />
                      ) : (
                        <ArrowUpRight color="#f43f5e" size={18} strokeWidth={2.5} />
                      )}
                    </View>

                    <View className="flex-1">
                      <Text className="text-slate-900 dark:text-white font-inter-semibold text-base" numberOfLines={1}>
                        {item.merchant_name}
                      </Text>
                      <Text className="text-slate-400 dark:text-zinc-500 font-inter text-xs mt-0.5">
                        {formatTxDate(item.created_at)}
                      </Text>
                      {badge && (
                        <View
                          className={`self-start mt-1 px-1.5 py-0.5 rounded ${
                            badge.tone === 'fail'
                              ? 'bg-status-fail/10'
                              : badge.tone === 'warn'
                              ? 'bg-status-warn/10'
                              : 'bg-black/[0.05] dark:bg-white/[0.07]'
                          }`}
                        >
                          <Text
                            className={`font-inter-medium text-[10px] ${
                              badge.tone === 'fail'
                                ? 'text-status-fail'
                                : badge.tone === 'warn'
                                ? 'text-status-warn'
                                : 'text-slate-500 dark:text-zinc-400'
                            }`}
                          >
                            {badge.label}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  <View className="items-end">
                    <Text
                      className={`font-mono-bold text-base ${
                        returned
                          ? 'text-slate-400 dark:text-zinc-500 line-through'
                          : isCredit
                          ? 'text-signal dark:text-signal-bright'
                          : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {isCredit ? '+' : '-'}₦
                      {Number(item.amount).toLocaleString('en-NG', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* More Services Modal */}
      <Modal
        visible={isMoreServicesVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsMoreServicesVisible(false)}
      >
        <View className="flex-1 justify-end bg-black/20 dark:bg-black/60">
          <BlurView intensity={20} tint={isDark ? "dark" : "light"} className="absolute inset-0" />
          <View className="bg-white dark:bg-[#111827] rounded-t-3xl pt-2 px-4 pb-8 min-h-[60%] border-t border-slate-200 dark:border-white/10">
            {/* Grab Handle */}
            <View className="items-center mb-4">
              <View className="w-12 h-1.5 bg-black/5 dark:bg-white/10 rounded-full" />
            </View>
            
            <View className="flex-row items-center justify-between mb-6 px-2">
              <Text className="text-slate-900 dark:text-white font-inter-bold text-xl">All Services</Text>
              <Pressable 
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setIsMoreServicesVisible(false);
                }}
                className="w-8 h-8 rounded-full bg-black/5 dark:bg-white/10 items-center justify-center"
              >
                <X color={isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.7)"} size={18} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {SERVICE_GROUPS.map((group) => {
                const tiles = SERVICE_TILES.filter((t) => t.group === group.id);
                if (tiles.length === 0) return null;
                return (
                  <View key={group.id}>
                    <Text className="text-slate-500 dark:text-white/60 font-inter-semibold uppercase tracking-widest text-[10px] mb-4 ml-2 mt-2">
                      {group.title}
                    </Text>
                    <View className="flex-row flex-wrap">
                      {tiles.map((tile) => (
                        <ServiceTileButton
                          key={tile.key}
                          tile={tile}
                          width="w-[25%]"
                          onPress={() => handleOpenService(tile.service)}
                        />
                      ))}
                    </View>
                  </View>
                );
              })}

              <View className="h-12" />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Transaction Receipt Modal (OPay Standard) */}
      <Modal
        visible={!!selectedTx}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedTx(null)}
      >
        <View className="flex-1 justify-center items-center px-4 bg-black/70">
          <View
            className="w-full max-w-sm max-h-[92%] rounded-3xl bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 overflow-hidden"
            style={{
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 12 },
              shadowOpacity: 0.35,
              shadowRadius: 24,
              elevation: 14,
            }}
          >
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 20, alignItems: 'center' }}
            >
              {/* Snapshot Receipt Card */}
              <View
                ref={txReceiptRef}
                collapsable={false}
                className="w-full items-center bg-white dark:bg-zinc-900 p-1 rounded-2xl"
              >
                {/* Big Green Badge */}
                <View className="w-20 h-20 rounded-full bg-signal/15 items-center justify-center mb-3">
                  <View
                    className="w-14 h-14 rounded-full bg-signal items-center justify-center"
                    style={{
                      shadowColor: '#00C896',
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.35,
                      shadowRadius: 10,
                      elevation: 8,
                    }}
                  >
                    <Check color="#000" size={28} strokeWidth={3.5} />
                  </View>
                </View>

                {/* Enlarged Title & Amount */}
                <Text className="text-slate-900 dark:text-white font-inter-bold text-2xl text-center mb-1 tracking-tight">
                  Payment Successful!
                </Text>
                <Text className="text-signal-dim dark:text-signal-bright font-inter-bold text-3xl mb-4">
                  ₦{selectedTx?.amount ? Number(selectedTx.amount).toLocaleString() : '0'}
                </Text>

                {/* PREPAID ELECTRICITY TOKEN CARD */}
                {selectedTx?.token && (
                  <View className="w-full bg-signal/10 border-2 border-dashed border-signal/40 rounded-2xl p-4 mb-4 items-center">
                    <Text className="text-signal-dim dark:text-signal-bright font-inter-semibold text-xs mb-1 uppercase tracking-wider">
                      20-Digit Recharge Token
                    </Text>
                    <Text className="text-slate-900 dark:text-white font-inter-bold text-lg tracking-wider mb-2 text-center select-all">
                      {selectedTx.token}
                    </Text>
                    {selectedTx.units && (
                      <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs mb-3">
                        Units Credited: {selectedTx.units}
                      </Text>
                    )}
                    <Pressable
                      onPress={() => copyToken(selectedTx.id, selectedTx.token)}
                      className="flex-row items-center bg-signal px-4 py-2 rounded-xl active:bg-signal"
                    >
                      {copiedTokenId === selectedTx.id ? (
                        <>
                          <CheckCheck color="#000" size={14} className="mr-1.5" />
                          <Text className="text-black font-inter-bold text-xs">Copied!</Text>
                        </>
                      ) : (
                        <>
                          <Copy color="#000" size={14} className="mr-1.5" />
                          <Text className="text-black font-inter-bold text-xs">Copy Token</Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                )}

                {/* Receipt Breakdown Card */}
                <View className="w-full rounded-2xl bg-slate-50 dark:bg-zinc-800/60 p-4 border border-slate-200/80 dark:border-zinc-700/60 mb-2">
                  <View className="flex-row justify-between mb-2.5">
                    <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs">Service</Text>
                    <Text className="text-slate-900 dark:text-white font-inter-semibold text-xs text-right flex-1 ml-3">
                      {selectedTx?.merchant_name}
                    </Text>
                  </View>

                  <View className="flex-row justify-between mb-2.5">
                    <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs">Beneficiary</Text>
                    <Text className="text-slate-900 dark:text-white font-inter-semibold text-xs text-right flex-1 ml-3">
                      {selectedTx?.recipient || selectedTx?.merchant_name || 'Direct Service'}
                    </Text>
                  </View>

                  <View className="flex-row justify-between mb-2.5">
                    <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs">Payment Method</Text>
                    <Text className="text-slate-900 dark:text-white font-inter-semibold text-xs text-right flex-1 ml-3">
                      {getAccountLabel(selectedTx?.account_used) || 'MiliPay Linked Account'}
                    </Text>
                  </View>

                  <View className="flex-row justify-between mb-2.5">
                    <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs">Transaction Fee</Text>
                    <Text className="text-signal-dim dark:text-signal-bright font-inter-bold text-xs text-right flex-1 ml-3">
                      ₦0.00 (FREE)
                    </Text>
                  </View>

                  <View className="flex-row justify-between mb-2.5">
                    <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs">Date & Time</Text>
                    <Text className="text-slate-900 dark:text-white font-inter-semibold text-xs text-right flex-1 ml-3">
                      {selectedTx ? new Date(selectedTx.created_at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }) : ''}
                    </Text>
                  </View>

                  <View className="flex-row justify-between items-center mb-2.5">
                    <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs">Reference</Text>
                    <Pressable
                      onPress={() => selectedTx && handleCopyReference(selectedTx.reference || `MP-TXN-${selectedTx.id.slice(0, 8)}`)}
                      className="flex-row items-center flex-1 justify-end ml-3"
                    >
                      <Text className="text-slate-900 dark:text-white font-inter-semibold text-xs mr-1.5" numberOfLines={1}>
                        {selectedTx?.reference || `MP-TXN-${selectedTx?.id?.slice(0, 8)}`}
                      </Text>
                      {hasCopiedRef ? (
                        <CheckCheck color="#00C896" size={13} />
                      ) : (
                        <Copy color="#64748b" size={13} />
                      )}
                    </Pressable>
                  </View>

                </View>

                <Text className="text-slate-400 dark:text-zinc-600 font-inter text-[10px] text-center mt-2">
                  MiliPay Technologies Limited • Keep this reference for support
                </Text>
              </View>

              {/* Share Actions (Picture & PDF) */}
              <View className="w-full flex-row gap-2.5 mt-4 mb-3">
                <Pressable
                  onPress={handleShareSelectedPdf}
                  disabled={isSharingPdf}
                  className="flex-1 h-12 rounded-xl bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 flex-row items-center justify-center active:bg-slate-200 dark:active:bg-zinc-700"
                >
                  {isSharingPdf ? (
                    <ActivityIndicator color="#00C896" size="small" />
                  ) : (
                    <>
                      <FileText color="#00C896" size={16} className="mr-1.5" />
                      <Text className="text-slate-800 dark:text-zinc-200 font-inter-bold text-xs">Share PDF</Text>
                    </>
                  )}
                </Pressable>

                <Pressable
                  onPress={handleShareSelectedImage}
                  disabled={isSharingImage}
                  className="flex-1 h-12 rounded-xl bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 flex-row items-center justify-center active:bg-slate-200 dark:active:bg-zinc-700"
                >
                  {isSharingImage ? (
                    <ActivityIndicator color="#00C896" size="small" />
                  ) : (
                    <>
                      <Share2 color="#00C896" size={16} className="mr-1.5" />
                      <Text className="text-slate-800 dark:text-zinc-200 font-inter-bold text-xs">Share Picture</Text>
                    </>
                  )}
                </Pressable>
              </View>

              {/* Close Button */}
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedTx(null);
                }}
                className="w-full h-14 rounded-2xl bg-signal active:bg-signal items-center justify-center shadow-md shadow-signal/20"
              >
                <Text className="text-black font-inter-bold text-base tracking-wide">Close Receipt</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

export default function HomeScreen({ navigation }: any) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme !== 'light';

  const user = useAuthStore((state) => state.user);
  const { linkMonoAccount } = useBankStore();

  // Mono records this as the identity behind the bank connection, and under the
  // Direct Debit model it is the identity a mandate is signed against. It used
  // to fall back to "Test User" / "test@biopay.app", so a customer whose
  // session carried no email — the store defaults it to an empty string —
  // linked a real bank account under a placeholder. `hasCompleteIdentity` below
  // stops the widget opening at all in that case.
  const monoConfig = {
    publicKey: process.env.EXPO_PUBLIC_MONO_PUBLIC_KEY || "",
    scope: "auth",
    data: {
      customer: {
        name: [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim(),
        email: user?.email ?? "",
      }
    },
    onClose: () => console.log('Widget closed'),
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
          ]
        );
      } catch (err) {
        console.error("Mono link error", err);
        Alert.alert(
          'Could not link account',
          err instanceof Error ? err.message : 'Please try again.'
        );
      }
    }
  };

  return (
    <MonoProvider {...monoConfig}>
      <HomeScreenContent navigation={navigation} />
    </MonoProvider>
  );
}