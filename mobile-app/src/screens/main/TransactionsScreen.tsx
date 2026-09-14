import React, { useState } from 'react';
import { useColorScheme } from 'nativewind';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, FileText } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

export default function TransactionsScreen({ navigation }: any) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme !== 'light';

  const [filter, setFilter] = useState<'all' | 'sent' | 'received' | 'bills'>('all');

  const handleFilter = (id: 'all' | 'sent' | 'received' | 'bills') => {
    Haptics.selectionAsync();
    setFilter(id);
  };

  const FilterButton = ({ id, label }: { id: any, label: string }) => (
    <Pressable 
      onPress={() => handleFilter(id)} 
      className={`px-5 py-2 rounded-full mr-3 ${filter === id ? 'bg-emerald-500/20 border border-emerald-500/50' : 'bg-black/5 dark:bg-white/10 border border-slate-200 dark:border-white/10 active:bg-black/10 dark:active:bg-white/20'}`}
    >
      <Text className={`${filter === id ? 'text-emerald-400 font-inter-semibold' : 'text-slate-500 dark:text-white/60 font-inter-medium'} text-xs tracking-wide`}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-black">
      <LinearGradient colors={isDark ? ['rgba(16, 185, 129, 0.08)', '#000'] : ['rgba(16, 185, 129, 0.08)', '#f8fafc']} className="absolute inset-0" />
      
      {/* Header */}
      <View className="px-6 pt-6 pb-4 flex-row items-center">
        <Pressable 
          onPress={() => navigation.goBack()} 
          className="w-10 h-10 items-center justify-center rounded-full bg-black/5 dark:bg-white/10 border border-slate-200 dark:border-white/10 active:bg-black/10 dark:active:bg-white/20"
        >
          <ChevronLeft color={isDark ? "#fff" : "#000"} size={20} />
        </Pressable>
        <Text className="text-slate-900 dark:text-white font-inter-bold text-xl ml-4">Transactions</Text>
      </View>

      {/* Filters (Scrollable) */}
      <View className="pb-4 border-b border-slate-200 dark:border-white/10">
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 24 }}
        >
          <FilterButton id="all" label="All" />
          <FilterButton id="sent" label="Sent" />
          <FilterButton id="received" label="Received" />
          <FilterButton id="bills" label="Bills" />
        </ScrollView>
      </View>

      {/* Transactions List */}
      <ScrollView className="flex-1 px-6 pt-4" showsVerticalScrollIndicator={false}>
        <View className="items-center justify-center py-20 mt-10">
           <View className="w-20 h-20 rounded-full bg-black/5 dark:bg-white/10 items-center justify-center mb-6">
             <FileText color={isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)"} size={32} />
           </View>
           <Text className="text-slate-900 dark:text-white font-inter-medium text-lg text-center mb-2">No transactions yet</Text>
           <Text className="text-slate-500 dark:text-white/60 font-inter text-sm text-center px-4">
             When you make payments, transfers, or pay bills, they will appear here.
           </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
