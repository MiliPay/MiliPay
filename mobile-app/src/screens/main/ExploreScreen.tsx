import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Activity, TrendingUp, TrendingDown, Clock } from 'lucide-react-native';

import { GlassCard } from '../../components/ui/GlassCard';

export default function ExploreScreen() {
  return (
    <SafeAreaView className="flex-1 bg-black">
      <LinearGradient colors={['rgba(16, 185, 129, 0.05)', '#000']} className="absolute inset-0" />
      
      <ScrollView className="flex-1 px-6 pt-6" showsVerticalScrollIndicator={false}>
        <View className="mb-8">
          <Text className="text-white font-inter-bold text-3xl tracking-tight mb-2">Insights</Text>
          <Text className="text-white/50 font-inter text-sm">Your financial health and network activity.</Text>
        </View>

        <View className="flex-row justify-between mb-8">
          <GlassCard intensity={20} className="w-[48%] p-4">
            <View className="w-10 h-10 rounded-full bg-emerald-500/20 items-center justify-center mb-3">
              <TrendingUp color="#10b981" size={20} />
            </View>
            <Text className="text-white/50 font-inter text-xs mb-1">Total Inflow</Text>
            <Text className="text-white font-mono-bold text-lg">₦1.2M</Text>
          </GlassCard>
          
          <GlassCard intensity={20} className="w-[48%] p-4">
            <View className="w-10 h-10 rounded-full bg-red-500/20 items-center justify-center mb-3">
              <TrendingDown color="#ef4444" size={20} />
            </View>
            <Text className="text-white/50 font-inter text-xs mb-1">Total Outflow</Text>
            <Text className="text-white font-mono-bold text-lg">₦450K</Text>
          </GlassCard>
        </View>

        <Text className="text-white font-inter-semibold text-lg mb-4">Network Activity</Text>
        
        <View className="mb-12">
          {[1, 2, 3].map((i) => (
            <View key={i} className="flex-row items-center mb-6">
              <View className="w-12 h-12 rounded-full bg-white/5 border border-white/10 items-center justify-center mr-4">
                <Activity color="rgba(255,255,255,0.5)" size={20} />
              </View>
              <View className="flex-1">
                <Text className="text-white font-inter-medium">Security Sync Completed</Text>
                <Text className="text-white/40 font-inter text-xs mt-1">Identity Gateway ping successful.</Text>
              </View>
              <View className="items-end">
                <Text className="text-white/30 font-inter text-xs">2h ago</Text>
              </View>
            </View>
          ))}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
