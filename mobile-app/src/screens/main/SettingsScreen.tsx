import React from 'react';
import { View, Text, ScrollView, Pressable, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ShieldCheck, Fingerprint, LogOut, Bell, Key, CreditCard } from 'lucide-react-native';

import { useAuthStore } from '../../store/useStore';
import { GlassCard } from '../../components/ui/GlassCard';

const SettingItem = ({ icon: Icon, label, value, type = 'nav', danger = false, onPress }: any) => (
  <Pressable 
    onPress={onPress}
    className="flex-row items-center justify-between py-4 border-b border-white/5"
  >
    <View className="flex-row items-center">
      <View className={`w-10 h-10 rounded-full items-center justify-center mr-4 ${danger ? 'bg-red-500/10' : 'bg-white/5'}`}>
        <Icon color={danger ? '#ef4444' : 'rgba(255,255,255,0.7)'} size={20} />
      </View>
      <Text className={`font-inter-medium text-base ${danger ? 'text-red-400' : 'text-white'}`}>
        {label}
      </Text>
    </View>
    {type === 'switch' ? (
      <Switch 
        value={value} 
        onValueChange={onPress}
        trackColor={{ false: 'rgba(255,255,255,0.1)', true: '#10b981' }}
        thumbColor="#fff"
      />
    ) : type === 'value' ? (
      <Text className="text-white/40 font-inter text-sm">{value}</Text>
    ) : (
      <Text className="text-white/20 font-mono-bold">></Text>
    )}
  </Pressable>
);

export default function SettingsScreen() {
  const logout = useAuthStore((state) => state.logout);

  return (
    <SafeAreaView className="flex-1 bg-black">
      <LinearGradient colors={['rgba(16, 185, 129, 0.05)', '#000']} className="absolute inset-0" />
      
      <ScrollView className="flex-1 px-6 pt-6" showsVerticalScrollIndicator={false}>
        <View className="mb-8">
          <Text className="text-white font-inter-bold text-3xl tracking-tight mb-2">Vault Security</Text>
          <Text className="text-white/50 font-inter text-sm">Manage your identity and authentication preferences.</Text>
        </View>

        <GlassCard intensity={20} className="mb-6 p-4">
          <View className="flex-row items-center mb-6">
            <View className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/50 items-center justify-center mr-4">
              <ShieldCheck color="#10b981" size={28} />
            </View>
            <View>
              <Text className="text-white font-inter-bold text-lg">Bank-Grade Security</Text>
              <Text className="text-white/50 font-inter text-xs mt-1">Your identity is cryptographically secured.</Text>
            </View>
          </View>
          
          <SettingItem icon={Fingerprint} label="Biometric Login" type="switch" value={true} />
          <SettingItem icon={Key} label="Change PIN" type="nav" />
          <SettingItem icon={Bell} label="Transaction Alerts" type="switch" value={true} />
        </GlassCard>

        <Text className="text-white/60 font-inter-semibold uppercase tracking-widest text-xs mb-3 ml-2 mt-4">
          Network Management
        </Text>
        <GlassCard intensity={20} className="mb-8 p-4">
          <SettingItem icon={CreditCard} label="Linked Accounts" type="value" value="3 Active" />
          <SettingItem icon={ShieldCheck} label="Identity Verification" type="value" value="Level 3 (Verified)" />
        </GlassCard>

        <Pressable 
          onPress={() => logout()}
          className="flex-row items-center justify-center py-4 bg-red-500/10 border border-red-500/20 rounded-2xl mb-12"
        >
          <LogOut color="#ef4444" size={20} />
          <Text className="text-red-400 font-inter-semibold ml-2">Lock Vault</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
