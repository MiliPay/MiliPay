import React from 'react';
import { useColorScheme } from 'nativewind';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Phone, Wifi, Droplet, Lightbulb, Tv, GraduationCap, Building, MoreHorizontal } from 'lucide-react-native';

const ServiceAction = ({ icon: Icon, label, color, onPress }: any) => (
  <Pressable 
    onPress={onPress}
    className="items-center justify-center w-1/4 mb-6"
  >
    <View className={`w-14 h-14 rounded-full items-center justify-center mb-2 bg-${color}-500/10 border border-${color}-500/20`}>
      <Icon color={color === 'emerald' ? '#10b981' : color === 'blue' ? '#3b82f6' : color === 'purple' ? '#a855f7' : color === 'orange' ? '#f97316' : '#fff'} size={24} />
    </View>
    <Text className="text-slate-500 dark:text-white/60 font-inter text-xs text-center">{label}</Text>
  </Pressable>
);

export default function ServicesScreen() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme !== 'light';

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-black">
      <LinearGradient colors={isDark ? ['rgba(16, 185, 129, 0.08)', '#000'] : ['rgba(16, 185, 129, 0.08)', '#f8fafc']} className="absolute inset-0" />
      
      <ScrollView className="flex-1 px-6 pt-6" showsVerticalScrollIndicator={false}>
        <View className="mb-8">
          <Text className="text-slate-900 dark:text-white font-inter-bold text-3xl tracking-tight mb-2">Services</Text>
          <Text className="text-slate-500 dark:text-white/60 font-inter text-sm">Pay bills, buy airtime, and manage subscriptions seamlessly.</Text>
        </View>

        <View className="bg-black/5 dark:bg-white/10 rounded-3xl p-6 border border-slate-200 dark:border-white/10 mb-8">
          <Text className="text-slate-900 dark:text-white font-inter-semibold text-lg mb-6">Essentials</Text>
          <View className="flex-row flex-wrap -mx-2">
            <ServiceAction icon={Phone} label="Airtime" color="emerald" />
            <ServiceAction icon={Wifi} label="Data" color="blue" />
            <ServiceAction icon={Lightbulb} label="Electricity" color="orange" />
            <ServiceAction icon={Tv} label="Cable TV" color="purple" />
          </View>
        </View>

        <View className="bg-black/5 dark:bg-white/10 rounded-3xl p-6 border border-slate-200 dark:border-white/10 mb-12">
          <Text className="text-slate-900 dark:text-white font-inter-semibold text-lg mb-6">Lifestyle & More</Text>
          <View className="flex-row flex-wrap -mx-2">
            <ServiceAction icon={Droplet} label="Water" color="white" />
            <ServiceAction icon={GraduationCap} label="Education" color="white" />
            <ServiceAction icon={Building} label="Taxes" color="white" />
            <ServiceAction icon={MoreHorizontal} label="More" color="white" />
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
