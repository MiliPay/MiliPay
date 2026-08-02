import React, { useState } from 'react';
import { View, Text, ScrollView, Dimensions, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { 
  useAnimatedScrollHandler, 
  useSharedValue, 
  useAnimatedStyle, 
  interpolate, 
  Extrapolation,
  withTiming,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Eye, EyeOff, Smartphone, Wifi, Zap, ArrowUpRight, ArrowDownLeft, MoreHorizontal, Lightbulb, Tv, Copy, CheckCheck } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';

import { useBankStore, useAuthStore } from '../../store/useStore';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width * 0.90;
const SNAP_INTERVAL = CARD_WIDTH + 16;

const mockBanks = [
  { id: '1', bankName: 'Guaranty Trust Bank', accountName: 'John Doe', accountNumber: '0123456789', balance: '₦450,000.00' },
  { id: '2', bankName: 'Zenith Bank', accountName: 'John Doe', accountNumber: '9876543210', balance: '₦1,250,000.00' },
  { id: '3', bankName: 'Access Bank', accountName: 'John Doe', accountNumber: '1122334455', balance: '₦50,000.00' },
];

const mockTransactions = {
  0: [
    { id: 't1', title: 'Chicken Republic', date: 'Today, 2:30 PM', amount: '-₦4,500.00', type: 'debit' },
    { id: 't2', title: 'Salary Deposit', date: 'Yesterday', amount: '+₦450,000.00', type: 'credit' },
  ],
  1: [
    { id: 't3', title: 'Uber Ride', date: 'Today, 8:15 AM', amount: '-₦3,200.00', type: 'debit' },
  ],
  2: [
    { id: 't4', title: 'Airtime Recharge', date: 'Aug 14, 2026', amount: '-₦1,000.00', type: 'debit' },
    { id: 't5', title: 'Transfer from Jane', date: 'Aug 10, 2026', amount: '+₦25,000.00', type: 'credit' },
  ]
};

const BankNode = ({ item, index, scrollX, isBalanceHidden, toggleBalance, isActive }: any) => {
  const [isCopied, setIsCopied] = useState(false);
  
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
      <View className="rounded-3xl overflow-hidden h-56 border border-white/10 shadow-2xl">
        <LinearGradient
          colors={index === 0 ? ['#065f46', '#022c22'] : index === 1 ? ['#1e3a8a', '#172554'] : ['#831843', '#4c0519']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          className="absolute inset-0"
        />
        <BlurView intensity={20} tint="dark" className="absolute inset-0" />
        
        <View className="p-6 flex-1">
          <View className="flex-row justify-between items-start mb-4">
            <View className="flex-1 pr-4">
              <View className="flex-row items-center mb-1">
                <Text className="text-white/60 font-inter-semibold uppercase tracking-widest text-xs mr-3">
                  {item.bankName}
                </Text>
                {isActive && (
                  <View className="px-2 py-0.5 bg-emerald-500/20 border border-emerald-500/40 rounded-full">
                    <Text className="text-emerald-400 font-inter-bold text-[8px] uppercase tracking-widest">Active Link</Text>
                  </View>
                )}
              </View>
              <Text className="text-white font-inter-bold text-lg">
                {item.accountName}
              </Text>
            </View>
            <View className="w-10 h-10 rounded-full bg-white/10 items-center justify-center">
              <Zap color="#10b981" size={20} />
            </View>
          </View>
          
          <View>
            <Text className="text-white/60 font-inter-semibold uppercase tracking-widest text-xs mb-1">Available Balance</Text>
            <View className="flex-row items-center justify-between">
              <Text className="text-white font-mono-bold text-3xl tracking-tighter">
                {isBalanceHidden ? '••••••••' : item.balance}
              </Text>
              <Pressable onPress={toggleBalance} className="p-2 -mr-2 bg-white/5 rounded-full active:bg-white/10">
                {isBalanceHidden ? <EyeOff color="rgba(255,255,255,0.7)" size={20} /> : <Eye color="rgba(255,255,255,0.7)" size={20} />}
              </Pressable>
            </View>
          </View>

          {/* Account Number */}
          <View className="flex-row items-center mt-auto pt-2 border-t border-white/10">
            <Text className="text-white/60 font-inter-semibold uppercase tracking-widest text-xs mr-2">Account No:</Text>
            <Text className="text-white/90 font-mono text-sm mr-2">{item.accountNumber}</Text>
            <Pressable 
              onPress={async () => {
                if (isCopied) return;
                await Clipboard.setStringAsync(item.accountNumber);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setIsCopied(true);
                setTimeout(() => setIsCopied(false), 2000);
              }}
              className="px-2 py-1.5 bg-white/10 rounded-md active:bg-white/20 ml-auto flex-row items-center min-w-[60px] justify-center"
            >
              {isCopied ? (
                <>
                  <CheckCheck color="#10b981" size={14} />
                  <Text className="text-emerald-400 font-inter-semibold text-[10px] ml-1 uppercase">Copied</Text>
                </>
              ) : (
                <Copy color="rgba(255,255,255,0.7)" size={14} />
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Animated.View>
  );
};

export default function HomeScreen({ navigation }: any) {
  const user = useAuthStore((state) => state.user);
  
  const activeBankIndex = useBankStore((state) => state.activeBankIndex);
  const setActiveBankIndex = useBankStore((state) => state.setActiveBankIndex);
  
  const [isBalanceHidden, setIsBalanceHidden] = useState(true);
  const [txFilter, setTxFilter] = useState<'7d' | '1m' | 'all'>('7d');

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
      const index = Math.round(event.contentOffset.x / SNAP_INTERVAL);
    },
  });

  const handleMomentumScrollEnd = (event: any) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / SNAP_INTERVAL);
    if (index !== activeBankIndex) {
      Haptics.selectionAsync();
      setActiveBankIndex(index);
    }
  };

  const toggleBalance = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsBalanceHidden(!isBalanceHidden);
  };

  const activeTransactions = mockTransactions[activeBankIndex as keyof typeof mockTransactions] || [];

  return (
    <SafeAreaView className="flex-1 bg-black">
      <LinearGradient colors={['#000', 'rgba(16, 185, 129, 0.05)']} className="absolute inset-0" />
      
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="px-6 pt-6 pb-6 flex-row justify-between items-center z-10">
          <View>
            <View className="flex-row items-center mb-1">
              <Text className="text-white font-inter-bold text-base tracking-wide">
                {getGreeting()}
              </Text>
            </View>
            <Text className="text-white text-3xl font-inter-bold tracking-tight">
              {user?.firstName || 'Welcome'}
            </Text>
          </View>
          <View className="w-12 h-12 rounded-full bg-white/10 border border-white/20 items-center justify-center">
            <Text className="text-white font-inter-bold">{user?.initials || 'ME'}</Text>
          </View>
        </View>

        {/* Bank Nodes Carousel */}
        <View className="mt-4">
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
            {mockBanks.map((item, index) => (
              <BankNode 
                key={item.id} 
                item={item} 
                index={index} 
                scrollX={scrollX}
                isBalanceHidden={isBalanceHidden}
                toggleBalance={toggleBalance}
                isActive={index === activeBankIndex}
              />
            ))}
          </Animated.ScrollView>
        </View>

        {/* Recent Merchants (Send Again) */}
        <View className="px-6 mt-8 mb-4">
          <Text className="text-white/90 font-inter-bold uppercase tracking-widest text-xs">
            Send Again
          </Text>
        </View>
        <View className="px-6 flex-row gap-5">
          <Pressable className="items-center" onPress={() => Haptics.selectionAsync()}>
            <View className="w-14 h-14 rounded-full bg-orange-500/20 border border-orange-500/40 items-center justify-center mb-2 shadow-lg shadow-orange-500/20">
              <Text className="text-orange-400 font-inter-bold text-lg">CR</Text>
            </View>
            <Text className="text-white/70 font-inter text-xs">Chicken Rep.</Text>
          </Pressable>
          
          <Pressable className="items-center" onPress={() => Haptics.selectionAsync()}>
            <View className="w-14 h-14 rounded-full bg-blue-500/20 border border-blue-500/40 items-center justify-center mb-2 shadow-lg shadow-blue-500/20">
              <Text className="text-blue-400 font-inter-bold text-lg">MT</Text>
            </View>
            <Text className="text-white/70 font-inter text-xs">MTN Bill</Text>
          </Pressable>

          <Pressable className="items-center" onPress={() => Haptics.selectionAsync()}>
            <View className="w-14 h-14 rounded-full bg-purple-500/20 border border-purple-500/40 items-center justify-center mb-2 shadow-lg shadow-purple-500/20">
              <Text className="text-purple-400 font-inter-bold text-lg">UB</Text>
            </View>
            <Text className="text-white/70 font-inter text-xs">Uber</Text>
          </Pressable>
        </View>

        {/* Quick Services Shortcuts */}
        <View className="px-6 mt-12 mb-5">
          <Text className="text-white/90 font-inter-bold uppercase tracking-widest text-xs">
            Quick Services
          </Text>
        </View>
        <View className="px-5 flex-row justify-between">
          <Pressable 
            onPress={() => {}}
            className="items-center w-[18%]"
          >
            <View className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/50 items-center justify-center mb-2">
              <Smartphone color="#10b981" size={20} />
            </View>
            <Text className="text-white/70 font-inter text-[11px] text-center" numberOfLines={1}>Airtime</Text>
          </Pressable>
          
          <Pressable 
            onPress={() => {}}
            className="items-center w-[18%]"
          >
            <View className="w-12 h-12 rounded-full bg-blue-500/20 border border-blue-500/50 items-center justify-center mb-2">
              <Wifi color="#3b82f6" size={20} />
            </View>
            <Text className="text-white/70 font-inter text-[11px] text-center" numberOfLines={1}>Data</Text>
          </Pressable>

          <Pressable 
            onPress={() => {}}
            className="items-center w-[18%]"
          >
            <View className="w-12 h-12 rounded-full bg-orange-500/20 border border-orange-500/50 items-center justify-center mb-2">
              <Lightbulb color="#f97316" size={20} />
            </View>
            <Text className="text-white/70 font-inter text-[11px] text-center" numberOfLines={1}>Power</Text>
          </Pressable>

          <Pressable 
            onPress={() => {}}
            className="items-center w-[18%]"
          >
            <View className="w-12 h-12 rounded-full bg-purple-500/20 border border-purple-500/50 items-center justify-center mb-2">
              <Tv color="#a855f7" size={20} />
            </View>
            <Text className="text-white/70 font-inter text-[11px] text-center" numberOfLines={1}>Cable</Text>
          </Pressable>

          <Pressable 
            onPress={() => navigation.navigate('Services')}
            className="items-center w-[18%]"
          >
            <View className="w-12 h-12 rounded-full bg-white/5 border border-white/10 items-center justify-center mb-2">
              <MoreHorizontal color="rgba(255,255,255,0.7)" size={20} />
            </View>
            <Text className="text-white/70 font-inter text-[11px] text-center" numberOfLines={1}>More</Text>
          </Pressable>
        </View>

        {/* Contextual Transaction History */}
        <View className="px-6 mt-12 mb-5 flex-row items-center justify-between">
          <Text className="text-white/90 font-inter-bold uppercase tracking-widest text-xs">
            Recent
          </Text>
          <View className="flex-row gap-1.5">
            <Pressable 
              onPress={() => setTxFilter('7d')}
              className={`px-2 py-1 rounded-md ${txFilter === '7d' ? 'bg-emerald-500/20 border border-emerald-500/30' : 'bg-white/5 border border-transparent active:bg-white/10'}`}
            >
              <Text className={`${txFilter === '7d' ? 'text-emerald-400' : 'text-white/50'} font-inter-semibold text-[10px] uppercase tracking-wider`}>7 Days</Text>
            </Pressable>
            
            <Pressable 
              onPress={() => setTxFilter('1m')}
              className={`px-2 py-1 rounded-md ${txFilter === '1m' ? 'bg-emerald-500/20 border border-emerald-500/30' : 'bg-white/5 border border-transparent active:bg-white/10'}`}
            >
              <Text className={`${txFilter === '1m' ? 'text-emerald-400' : 'text-white/50'} font-inter-semibold text-[10px] uppercase tracking-wider`}>1 Month</Text>
            </Pressable>
            
            <Pressable 
              onPress={() => setTxFilter('all')}
              className={`px-2 py-1 rounded-md ${txFilter === 'all' ? 'bg-emerald-500/20 border border-emerald-500/30' : 'bg-white/5 border border-transparent active:bg-white/10'}`}
            >
              <Text className={`${txFilter === 'all' ? 'text-emerald-400' : 'text-white/50'} font-inter-semibold text-[10px] uppercase tracking-wider`}>All</Text>
            </Pressable>
          </View>
        </View>
        <View className="px-6 pb-12">
          {activeTransactions.map((tx: any, i: number) => (
            <Animated.View 
              key={tx.id} 
              className="flex-row justify-between items-center mb-6"
            >
              <View className="flex-row items-center">
                <View className={`w-12 h-12 rounded-full items-center justify-center mr-4 ${tx.type === 'debit' ? 'bg-red-500/10' : 'bg-emerald-500/10'}`}>
                  {tx.type === 'debit' ? <ArrowUpRight color="#ef4444" size={20} /> : <ArrowDownLeft color="#10b981" size={20} />}
                </View>
                <View>
                  <Text className="text-white font-inter-semibold text-base">{tx.title}</Text>
                  <Text className="text-white/40 font-inter text-xs mt-1">{tx.date}</Text>
                </View>
              </View>
              <Text className={`font-mono-bold text-base ${tx.type === 'debit' ? 'text-white' : 'text-emerald-400'}`}>
                {tx.amount}
              </Text>
            </Animated.View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
