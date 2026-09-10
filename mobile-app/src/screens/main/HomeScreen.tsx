import React, { useState, useEffect } from 'react';
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
  Eye, EyeOff, Smartphone, Wifi, Zap, ArrowDownLeft, MoreHorizontal, Lightbulb, Tv, Copy, CheckCheck, Plus,
  Globe, Bus, GraduationCap, Droplet, Plane, HeartPulse, Ticket, Landmark, X
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';

import { MonoProvider, useMonoConnect } from '@mono.co/connect-react-native';
import { useBankStore, useAuthStore } from '../../store/useStore';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width * 0.90;
const SNAP_INTERVAL = CARD_WIDTH + 16;

const CARD_THEMES = [
  {
    gradient: ['#065f46', '#022c22'] as [string, string],
    bg: '#064e3b',
    accent: '#34d399',
    badgeBg: 'rgba(52, 211, 153, 0.25)',
    badgeBorder: 'rgba(52, 211, 153, 0.5)',
    badgeText: '#34d399',
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

  const handleLinkPress = () => {
    if (linkedAccounts.length >= 3) {
      Alert.alert(
        "Limit Reached",
        "You have reached the maximum limit of 3 linked bank accounts. Please remove an existing account to link a new one."
      );
      return;
    }
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
        <View className="w-16 h-16 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/25 dark:border-emerald-500/40 items-center justify-center mb-4">
          <Plus color="#10b981" size={32} />
        </View>
        <Text className="text-slate-900 dark:text-white font-inter-bold text-xl mb-1">Link Bank Account</Text>
        <Text className="text-slate-500 dark:text-white/60 font-inter text-sm text-center px-8">Connect another account to use with BioPay.</Text>
      </Pressable>
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
              <Zap color="#34d399" size={20} />
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
                    <CheckCheck color="#34d399" size={14} />
                    <Text className="text-emerald-300 font-inter-semibold text-[10px] ml-1 uppercase">Copied</Text>
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

const BankNode = ({ item, index, scrollX, isBalanceHidden, toggleBalance, isActive }: any) => {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme !== 'light';

  if (item.isLinkCard) {
    return <LinkBankCard index={index} scrollX={scrollX} isDark={isDark} />;
  }

  return (
    <ActiveBankCard 
      item={item} 
      index={index} 
      scrollX={scrollX} 
      isBalanceHidden={isBalanceHidden} 
      toggleBalance={toggleBalance} 
      isActive={isActive} 
      isDark={isDark} 
    />
  );
};

function HomeScreenContent({ navigation }: any) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme !== 'light';

  const user = useAuthStore((state) => state.user);
  const { linkedAccounts, activeBankIndex, isLoading, fetchAccounts, setActiveBankIndex } = useBankStore();
  
  const [isBalanceHidden, setIsBalanceHidden] = useState(true);
  const [isMoreServicesVisible, setIsMoreServicesVisible] = useState(false);

  useEffect(() => {
    if (user?.id) {
      fetchAccounts(user.id);
    }
  }, [user?.id]);

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
    onMomentumEnd: (event) => {
      // 
    },
  });

  const handleMomentumScrollEnd = (event: any) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / SNAP_INTERVAL);
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
      <LinearGradient colors={isDark ? ['rgba(16, 185, 129, 0.08)', '#000'] : ['rgba(16, 185, 129, 0.08)', '#f8fafc']} className="absolute inset-0" />
      
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
            onPress={() => navigation.navigate('SettingsStack')}
            className="w-12 h-12 rounded-full bg-black/5 dark:bg-white/10 items-center justify-center border border-slate-200 dark:border-white/10"
          >
            <Text className="text-slate-900 dark:text-white font-inter-bold">{user?.initials || 'ME'}</Text>
          </Pressable>
        </View>

        {/* Carousel */}
        <View className="mb-8 h-64 justify-center">
          {isLoading && linkedAccounts.length === 0 ? (
            <View className="flex-1 justify-center items-center">
              <ActivityIndicator color="#10b981" />
            </View>
          ) : (
            <Animated.ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={SNAP_INTERVAL}
              decelerationRate="fast"
              onScroll={scrollHandler}
              onMomentumScrollEnd={handleMomentumScrollEnd}
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
                />
              ))}
            </Animated.ScrollView>
          )}
        </View>

        {/* Quick Services */}
        <View className="px-6 mb-8">
          <Text className="text-slate-500 dark:text-white/60 font-inter-bold uppercase tracking-widest text-xs mb-4">
            Quick Services
          </Text>
          <View className="flex-row flex-wrap justify-between">
            <Pressable className="items-center w-[22%] mb-6">
              <View className="w-14 h-14 rounded-full bg-emerald-500/15 items-center justify-center mb-2">
                <Smartphone color="#10b981" size={24} />
              </View>
              <Text className="text-slate-500 dark:text-white/60 font-inter text-xs text-center" numberOfLines={1}>Airtime</Text>
            </Pressable>
            <Pressable className="items-center w-[22%] mb-6">
              <View className="w-14 h-14 rounded-full bg-blue-500/15 items-center justify-center mb-2">
                <Wifi color="#3b82f6" size={24} />
              </View>
              <Text className="text-slate-500 dark:text-white/60 font-inter text-xs text-center" numberOfLines={1}>Data</Text>
            </Pressable>
            <Pressable className="items-center w-[22%] mb-6">
              <View className="w-14 h-14 rounded-full bg-orange-500/15 items-center justify-center mb-2">
                <Lightbulb color="#f97316" size={24} />
              </View>
              <Text className="text-slate-500 dark:text-white/60 font-inter text-xs text-center" numberOfLines={1}>Power</Text>
            </Pressable>
            <Pressable className="items-center w-[22%] mb-6">
              <View className="w-14 h-14 rounded-full bg-purple-500/15 items-center justify-center mb-2">
                <Tv color="#a855f7" size={24} />
              </View>
              <Text className="text-slate-500 dark:text-white/60 font-inter text-xs text-center" numberOfLines={1}>Cable</Text>
            </Pressable>
            
            <Pressable className="items-center w-[22%] mb-6">
              <View className="w-14 h-14 rounded-full bg-cyan-500/15 items-center justify-center mb-2">
                <Globe color="#06b6d4" size={24} />
              </View>
              <Text className="text-slate-500 dark:text-white/60 font-inter text-xs text-center" numberOfLines={1}>Internet</Text>
            </Pressable>
            <Pressable className="items-center w-[22%] mb-6">
              <View className="w-14 h-14 rounded-full bg-rose-500/15 items-center justify-center mb-2">
                <Bus color="#f43f5e" size={24} />
              </View>
              <Text className="text-slate-500 dark:text-white/60 font-inter text-xs text-center" numberOfLines={1}>Transport</Text>
            </Pressable>
            <Pressable className="items-center w-[22%] mb-6">
              <View className="w-14 h-14 rounded-full bg-indigo-500/15 items-center justify-center mb-2">
                <GraduationCap color="#6366f1" size={24} />
              </View>
              <Text className="text-slate-500 dark:text-white/60 font-inter text-xs text-center" numberOfLines={1}>Education</Text>
            </Pressable>
            <Pressable onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setIsMoreServicesVisible(true);
            }} className="items-center w-[22%] mb-6">
              <View className="w-14 h-14 rounded-full bg-black/5 dark:bg-white/10 border border-slate-200 dark:border-white/10 items-center justify-center mb-2">
                <MoreHorizontal color={isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.7)"} size={24} />
              </View>
              <Text className="text-slate-500 dark:text-white/60 font-inter text-xs text-center" numberOfLines={1}>More</Text>
            </Pressable>
          </View>
        </View>

        {/* Recent Transactions */}
        <View className="px-6 mb-5 flex-row items-center justify-between">
          <View className="flex-row items-center">
            <Text className="text-slate-500 dark:text-white/60 font-inter-bold uppercase tracking-widest text-xs">
              Recent Transactions
            </Text>
            <View className="ml-3 px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/30">
              <Text className="text-emerald-400 font-inter-semibold text-[9px] uppercase tracking-wider">7 Days</Text>
            </View>
          </View>
          <Pressable 
            onPress={() => navigation.navigate('Transactions')} 
            className="px-3 py-1.5 rounded-full bg-black/5 dark:bg-white/10 border border-slate-200 dark:border-white/10 active:bg-black/5 dark:bg-white/"
          >
            <Text className="text-slate-900 dark:text-white font-inter-medium text-[11px]">View All</Text>
          </Pressable>
        </View>
        
        <View className="px-6 pb-12 items-center justify-center py-8">
           <View className="w-16 h-16 rounded-full bg-black/5 dark:bg-white/10 items-center justify-center mb-4">
             <ArrowDownLeft color={isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)"} size={24} />
           </View>
           <Text className="text-slate-500 dark:text-white/60 font-inter text-sm">No recent MiliPay transactions</Text>
        </View>
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
              {/* Daily Essentials */}
              <Text className="text-slate-500 dark:text-white/60 font-inter-semibold uppercase tracking-widest text-[10px] mb-4 ml-2 mt-2">
                Daily Essentials
              </Text>
              <View className="flex-row flex-wrap justify-between">
                <Pressable className="items-center w-[25%] mb-6">
                  <View className="w-14 h-14 rounded-2xl bg-emerald-500/15 items-center justify-center mb-2">
                    <Smartphone color="#10b981" size={24} />
                  </View>
                  <Text className="text-slate-500 dark:text-white/60 font-inter text-xs text-center">Airtime</Text>
                </Pressable>
                <Pressable className="items-center w-[25%] mb-6">
                  <View className="w-14 h-14 rounded-2xl bg-blue-500/15 items-center justify-center mb-2">
                    <Wifi color="#3b82f6" size={24} />
                  </View>
                  <Text className="text-slate-500 dark:text-white/60 font-inter text-xs text-center">Data</Text>
                </Pressable>
                <Pressable className="items-center w-[25%] mb-6">
                  <View className="w-14 h-14 rounded-2xl bg-cyan-500/15 items-center justify-center mb-2">
                    <Globe color="#06b6d4" size={24} />
                  </View>
                  <Text className="text-slate-500 dark:text-white/60 font-inter text-xs text-center">Internet</Text>
                </Pressable>
                <Pressable className="items-center w-[25%] mb-6">
                  <View className="w-14 h-14 rounded-2xl bg-rose-500/15 items-center justify-center mb-2">
                    <Bus color="#f43f5e" size={24} />
                  </View>
                  <Text className="text-slate-500 dark:text-white/60 font-inter text-xs text-center">Transport</Text>
                </Pressable>
              </View>

              {/* Utilities & Bills */}
              <Text className="text-slate-500 dark:text-white/60 font-inter-semibold uppercase tracking-widest text-[10px] mb-4 ml-2 mt-4">
                Utilities & Bills
              </Text>
              <View className="flex-row flex-wrap justify-between">
                <Pressable className="items-center w-[25%] mb-6">
                  <View className="w-14 h-14 rounded-2xl bg-orange-500/15 items-center justify-center mb-2">
                    <Lightbulb color="#f97316" size={24} />
                  </View>
                  <Text className="text-slate-500 dark:text-white/60 font-inter text-xs text-center">Power</Text>
                </Pressable>
                <Pressable className="items-center w-[25%] mb-6">
                  <View className="w-14 h-14 rounded-2xl bg-purple-500/15 items-center justify-center mb-2">
                    <Tv color="#a855f7" size={24} />
                  </View>
                  <Text className="text-slate-500 dark:text-white/60 font-inter text-xs text-center">Cable TV</Text>
                </Pressable>
                <Pressable className="items-center w-[25%] mb-6">
                  <View className="w-14 h-14 rounded-2xl bg-teal-500/15 items-center justify-center mb-2">
                    <Droplet color="#14b8a6" size={24} />
                  </View>
                  <Text className="text-slate-500 dark:text-white/60 font-inter text-xs text-center">Water</Text>
                </Pressable>
                <Pressable className="items-center w-[25%] mb-6">
                  <View className="w-14 h-14 rounded-2xl bg-slate-500/15 items-center justify-center mb-2">
                    <Landmark color="#94a3b8" size={24} />
                  </View>
                  <Text className="text-slate-500 dark:text-white/60 font-inter text-xs text-center">Taxes</Text>
                </Pressable>
              </View>

              {/* Lifestyle */}
              <Text className="text-slate-500 dark:text-white/60 font-inter-semibold uppercase tracking-widest text-[10px] mb-4 ml-2 mt-4">
                Lifestyle & Others
              </Text>
              <View className="flex-row flex-wrap justify-start">
                <Pressable className="items-center w-[25%] mb-6">
                  <View className="w-14 h-14 rounded-2xl bg-indigo-500/15 items-center justify-center mb-2">
                    <GraduationCap color="#6366f1" size={24} />
                  </View>
                  <Text className="text-slate-500 dark:text-white/60 font-inter text-xs text-center">Education</Text>
                </Pressable>
                <Pressable className="items-center w-[25%] mb-6">
                  <View className="w-14 h-14 rounded-2xl bg-pink-500/15 items-center justify-center mb-2">
                    <Ticket color="#ec4899" size={24} />
                  </View>
                  <Text className="text-slate-500 dark:text-white/60 font-inter text-xs text-center">Movies</Text>
                </Pressable>
                <Pressable className="items-center w-[25%] mb-6">
                  <View className="w-14 h-14 rounded-2xl bg-sky-500/15 items-center justify-center mb-2">
                    <Plane color="#0ea5e9" size={24} />
                  </View>
                  <Text className="text-slate-500 dark:text-white/60 font-inter text-xs text-center">Flights</Text>
                </Pressable>
                <Pressable className="items-center w-[25%] mb-6">
                  <View className="w-14 h-14 rounded-2xl bg-red-500/15 items-center justify-center mb-2">
                    <HeartPulse color="#ef4444" size={24} />
                  </View>
                  <Text className="text-slate-500 dark:text-white/60 font-inter text-xs text-center">Health</Text>
                </Pressable>
              </View>
              
              <View className="h-12" />
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

  const monoConfig = {
    publicKey: process.env.EXPO_PUBLIC_MONO_PUBLIC_KEY || "", 
    scope: "auth",
    data: {
      customer: {
        name: user?.firstName || "Test User",
        email: user?.email || "test@biopay.app"
      }
    },
    onClose: () => console.log('Widget closed'),
    onSuccess: async (data: any) => {
      try {
        const code = data.getAuthCode();
        await linkMonoAccount(code);
      } catch (err) {
        console.error("Mono link error", err);
      }
    }
  };

  return (
    <MonoProvider {...monoConfig}>
      <HomeScreenContent navigation={navigation} />
    </MonoProvider>
  );
}