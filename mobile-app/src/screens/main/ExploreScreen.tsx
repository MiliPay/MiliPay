import React from 'react';
import { useColorScheme } from 'nativewind';
import { View, Text, ScrollView, Pressable, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { 
  MapPin, 
  Gift, 
  ChevronRight,
  Store
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { GlassCard } from '../../components/ui/GlassCard';

const PromoCard = ({ title, subtitle, bgGradient }: any) => {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme !== 'light';
  return (
    <Pressable 
      onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
      className="mr-4 w-64 h-32 rounded-2xl overflow-hidden"
    >
      <LinearGradient colors={bgGradient} className="absolute inset-0" start={{x: 0, y: 0}} end={{x: 1, y: 1}} />
      <View className="flex-1 p-4 justify-between">
        <View className="w-8 h-8 rounded-full bg-black/5 dark:bg-white/10 items-center justify-center">
          <Gift color={isDark ? "#fff" : "#000"} size={16} />
        </View>
        <View>
          <Text className="text-slate-900 dark:text-white font-inter-bold text-lg mb-1">{title}</Text>
          <Text className="text-slate-500 dark:text-white/60 font-inter text-xs">{subtitle}</Text>
        </View>
      </View>
    </Pressable>
  );
};

const MerchantRow = ({ name, category, distance }: any) => {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme !== 'light';
  return (
    <Pressable 
      onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
      className="flex-row items-center py-4 border-b border-slate-200 dark:border-white/10"
    >
      <View className="w-12 h-12 rounded-xl bg-black/5 dark:bg-white/10 items-center justify-center mr-4">
        <Store color={isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.7)"} size={20} />
      </View>
      <View className="flex-1">
        <Text className="text-slate-900 dark:text-white font-inter-semibold text-base mb-1">{name}</Text>
        <View className="flex-row items-center">
          <Text className="text-emerald-600 dark:text-emerald-400 font-inter text-xs">{category}</Text>
          <Text className="text-slate-500 dark:text-white/60 text-xs mx-2">•</Text>
          <MapPin color={isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)"} size={10} />
          <Text className="text-slate-500 dark:text-white/60 font-inter text-xs ml-1">{distance}</Text>
        </View>
      </View>
      <ChevronRight color={isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)"} size={20} />
    </Pressable>
  );
};

export default function ExploreScreen() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme !== 'light';

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-black">
      <LinearGradient colors={isDark ? ['rgba(16, 185, 129, 0.08)', '#000'] : ['rgba(16, 185, 129, 0.08)', '#f8fafc']} className="absolute inset-0" />
      
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="px-6 pt-6 pb-6">
          <Text className="text-slate-900 dark:text-white font-inter-bold text-2xl tracking-tight mb-1">Explore</Text>
          <Text className="text-slate-500 dark:text-white/60 font-inter text-sm">Find merchants and get rewards.</Text>
        </View>

        {/* Promotions Carousel */}
        <View className="mb-8">
          <View className="px-6 mb-3 flex-row items-center justify-between">
            <Text className="text-slate-900 dark:text-white font-inter-semibold text-lg">Special Offers</Text>
          </View>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 24 }}
          >
            <PromoCard 
              title="Refer & Earn ₦500" 
              subtitle="Invite a friend to MiliPay today."
              bgGradient={['#10b981', '#047857']}
            />
            <PromoCard 
              title="10% Airtime Cashback" 
              subtitle="Valid on all networks this weekend."
              bgGradient={['#3b82f6', '#1d4ed8']}
            />
            <PromoCard 
              title="Pay with Palm" 
              subtitle="Get 5% off at select supermarkets."
              bgGradient={['#8b5cf6', '#6d28d9']}
            />
          </ScrollView>
        </View>

        {/* Nearby Merchants */}
        <View className="px-6 pb-12">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-slate-900 dark:text-white font-inter-semibold text-lg">Pay with Palm Nearby</Text>
            <Pressable onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}>
              <Text className="text-emerald-600 dark:text-emerald-400 font-inter text-sm">View Map</Text>
            </Pressable>
          </View>
          <Text className="text-slate-500 dark:text-white/60 font-inter text-xs mb-4">
            Merchants accepting MiliPay biometric payments
          </Text>

          <GlassCard intensity={isDark ? 15 : 40} className="p-2 px-4">
            <MerchantRow name="Shoprite Ikeja" category="Supermarket" distance="1.2 km" />
            <MerchantRow name="Domino's Pizza" category="Restaurant" distance="2.5 km" />
            <MerchantRow name="Ebeano Supermarket" category="Supermarket" distance="3.8 km" />
            <MerchantRow name="Filmhouse Cinemas" category="Entertainment" distance="5.0 km" />
          </GlassCard>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
