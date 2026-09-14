import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { 
  ChevronLeft, 
  ShieldCheck, 
  Lock, 
  Sparkles, 
  Clock, 
  Zap, 
  Check, 
  Info,
  ShieldAlert,
  ArrowRight
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useColorScheme } from 'nativewind';

import { useAuthStore } from '../../store/useStore';
import { GlassCard } from '../../components/ui/GlassCard';

const PRESET_THRESHOLDS = [
  { label: '₦2,000', value: 2000 },
  { label: '₦5,000', value: 5000 },
  { label: '₦10,000 (Default)', value: 10000 },
  { label: '₦25,000', value: 25000 },
  { label: '₦50,000', value: 50000 },
  { label: '₦150,000 (Tier Max)', value: 150000 },
];

export default function AccountLimitsScreen({ navigation }: any) {
  const user = useAuthStore((state) => state.user);
  const updatePinThreshold = useAuthStore((state) => state.updatePinThreshold);

  const { colorScheme } = useColorScheme();
  const isDark = colorScheme !== 'light';

  const currentThreshold = user?.pinThreshold || 10000;
  const [selectedThreshold, setSelectedThreshold] = useState<number>(currentThreshold);
  const [customInput, setCustomInput] = useState<string>(currentThreshold.toString());
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (user?.pinThreshold) {
      setSelectedThreshold(user.pinThreshold);
      setCustomInput(user.pinThreshold.toString());
    }
  }, [user?.pinThreshold]);

  const handleSelectPreset = (value: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedThreshold(value);
    setCustomInput(value.toString());
    setSaveSuccess(false);
  };

  const handleCustomInputChange = (text: string) => {
    const numeric = text.replace(/[^0-9]/g, '');
    setCustomInput(numeric);
    const parsed = parseInt(numeric, 10);
    if (!isNaN(parsed)) {
      setSelectedThreshold(parsed);
    }
    setSaveSuccess(false);
  };

  const handleSave = async () => {
    const amount = parseInt(customInput, 10);
    if (isNaN(amount) || amount < 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid threshold amount.');
      return;
    }

    if (amount > 150000) {
      Alert.alert('Tier 2 Limit', 'Your current Tier 2 account allows a maximum threshold of ₦150,000 per transaction.');
      return;
    }

    setIsSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const success = await updatePinThreshold(amount);
    setIsSaving(false);

    if (success) {
      setSaveSuccess(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => setSaveSuccess(false), 3000);
    } else {
      Alert.alert('Update Failed', 'Could not update your PIN threshold. Please check your network and try again.');
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-black">
      <LinearGradient 
        colors={isDark ? ['rgba(16, 185, 129, 0.12)', '#000'] : ['rgba(16, 185, 129, 0.08)', '#f8fafc']} 
        className="absolute inset-0" 
      />

      {/* Header */}
      <View className="flex-row items-center justify-between px-6 pt-4 pb-2">
        <Pressable 
          onPress={() => navigation.goBack()} 
          className="w-10 h-10 rounded-full bg-black/5 dark:bg-white/5 items-center justify-center -ml-2"
        >
          <ChevronLeft color={isDark ? '#fff' : '#0f172a'} size={24} />
        </Pressable>
        <Text className="text-slate-900 dark:text-white font-inter-bold text-lg">Limits & PIN Security</Text>
        <View className="w-10" />
      </View>

      <ScrollView className="flex-1 px-6 pt-4 pb-12" showsVerticalScrollIndicator={false}>
        
        {/* Tier 2 Status Card */}
        <GlassCard intensity={isDark ? 20 : 50} className="p-5 mb-6 border border-emerald-500/20">
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-row items-center">
              <View className="w-10 h-10 rounded-xl bg-emerald-500/15 items-center justify-center mr-3">
                <ShieldCheck color="#10b981" size={22} />
              </View>
              <View>
                <Text className="text-slate-900 dark:text-white font-inter-bold text-base">Tier 2 Verified</Text>
                <Text className="text-emerald-600 dark:text-emerald-400 font-inter-medium text-xs">Active Biometric Account</Text>
              </View>
            </View>
            <View className="bg-emerald-500/15 px-2.5 py-1 rounded-full border border-emerald-500/30">
              <Text className="text-emerald-600 dark:text-emerald-400 font-inter-semibold text-xs">Active</Text>
            </View>
          </View>

          <Text className="text-slate-600 dark:text-white/60 font-inter text-xs leading-relaxed mb-4">
            Granted automatically with your confirmed National Identity Number (NIN) and palm vein registration.
          </Text>

          <View className="flex-row gap-3 pt-3 border-t border-black/5 dark:border-white/10">
            <View className="flex-1 bg-black/5 dark:bg-white/5 p-3 rounded-xl">
              <Text className="text-slate-500 dark:text-white/40 font-inter text-[11px] uppercase tracking-wider">Single Txn Cap</Text>
              <Text className="text-slate-900 dark:text-white font-inter-bold text-base mt-1">₦150,000</Text>
            </View>
            <View className="flex-1 bg-black/5 dark:bg-white/5 p-3 rounded-xl">
              <Text className="text-slate-500 dark:text-white/40 font-inter text-[11px] uppercase tracking-wider">Daily Max Limit</Text>
              <Text className="text-slate-900 dark:text-white font-inter-bold text-base mt-1">₦500,000</Text>
              <Text className="text-slate-400 dark:text-white/30 font-inter text-[9px] mt-0.5">Resets 00:00 WAT</Text>
            </View>
          </View>
        </GlassCard>

        {/* PIN Security Threshold Card */}
        <View className="mb-6">
          <Text className="text-slate-400 dark:text-white/40 font-inter-semibold uppercase tracking-widest text-[11px] mb-2 ml-1">
            PIN SECURITY THRESHOLD
          </Text>

          <GlassCard intensity={isDark ? 15 : 40} className="p-5">
            <View className="flex-row items-center mb-3">
              <View className="w-9 h-9 rounded-xl bg-signal/15 items-center justify-center mr-3">
                <Lock color="#10b981" size={18} />
              </View>
              <View className="flex-1">
                <Text className="text-slate-900 dark:text-white font-inter-bold text-base">Payment PIN Trigger</Text>
                <Text className="text-slate-500 dark:text-white/40 font-inter text-xs">Require PIN above this amount</Text>
              </View>
            </View>

            <Text className="text-slate-600 dark:text-white/60 font-inter text-xs leading-relaxed mb-4">
              Payments below this amount are authorized <Text className="font-inter-bold text-emerald-500">instantly in &lt;450ms</Text> using only your palm scan. Payments above this require your 4-digit MiliPay PIN on the terminal.
            </Text>

            {/* Presets Grid */}
            <Text className="text-slate-400 dark:text-white/40 font-inter-medium text-xs mb-2">Quick Presets:</Text>
            <View className="flex-row flex-wrap gap-2 mb-4">
              {PRESET_THRESHOLDS.map((preset) => {
                const isSelected = selectedThreshold === preset.value;
                return (
                  <Pressable
                    key={preset.value}
                    onPress={() => handleSelectPreset(preset.value)}
                    className={`px-3 py-2 rounded-xl border transition-all ${
                      isSelected 
                        ? 'bg-emerald-500 border-emerald-400' 
                        : 'bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10'
                    }`}
                  >
                    <Text className={`font-inter-semibold text-xs ${isSelected ? 'text-black' : 'text-slate-700 dark:text-white/80'}`}>
                      {preset.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Custom Amount Field */}
            <Text className="text-slate-400 dark:text-white/40 font-inter-medium text-xs mb-2">Custom Threshold (₦):</Text>
            <View className="flex-row items-center bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-3 py-2.5 mb-4">
              <Text className="text-slate-500 dark:text-white/40 font-inter-bold text-base mr-2">₦</Text>
              <TextInput
                value={customInput}
                onChangeText={handleCustomInputChange}
                keyboardType="number-pad"
                placeholder="10000"
                placeholderTextColor={isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)"}
                className="flex-1 text-slate-900 dark:text-white font-inter-bold text-base p-0"
              />
            </View>

            {/* Live Explanation Banner */}
            <View className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3.5 flex-row items-start mb-5">
              <Zap color="#10b981" size={16} className="mt-0.5 mr-2.5 shrink-0" />
              <Text className="flex-1 text-emerald-800 dark:text-emerald-300 font-inter text-xs leading-relaxed">
                Transactions up to <Text className="font-inter-bold">₦{selectedThreshold.toLocaleString()}</Text> will approve with a palm scan alone. Transactions of <Text className="font-inter-bold">₦{(selectedThreshold + 1).toLocaleString()}</Text> and above will prompt for your 4-digit PIN.
              </Text>
            </View>

            {/* Save Button */}
            <Pressable
              onPress={handleSave}
              disabled={isSaving}
              className={`py-3.5 rounded-xl items-center justify-center flex-row ${
                saveSuccess 
                  ? 'bg-emerald-600' 
                  : 'bg-emerald-500'
              }`}
              style={({ pressed }) => ({ opacity: pressed || isSaving ? 0.8 : 1 })}
            >
              {isSaving ? (
                <ActivityIndicator color="#000" size="small" />
              ) : saveSuccess ? (
                <View className="flex-row items-center">
                  <Check color="#000" size={18} className="mr-2" />
                  <Text className="text-black font-inter-bold text-sm">Security Threshold Saved!</Text>
                </View>
              ) : (
                <Text className="text-black font-inter-bold text-sm">Save PIN Threshold</Text>
              )}
            </Pressable>
          </GlassCard>
        </View>

        {/* Tier 3 Coming Soon Card */}
        <View className="mb-10">
          <Text className="text-slate-400 dark:text-white/40 font-inter-semibold uppercase tracking-widest text-[11px] mb-2 ml-1">
            FUTURE UPGRADE
          </Text>

          <GlassCard intensity={isDark ? 10 : 30} className="p-5 border border-white/5 opacity-80">
            <View className="flex-row items-center justify-between mb-2">
              <View className="flex-row items-center">
                <View className="w-9 h-9 rounded-xl bg-purple-500/15 items-center justify-center mr-3">
                  <Sparkles color="#a855f7" size={18} />
                </View>
                <View>
                  <Text className="text-slate-800 dark:text-white font-inter-bold text-base">Tier 3 (Enterprise)</Text>
                  <Text className="text-purple-600 dark:text-purple-400 font-inter-medium text-xs">BVN Verification</Text>
                </View>
              </View>
              <View className="bg-purple-500/15 px-2.5 py-1 rounded-full border border-purple-500/30">
                <Text className="text-purple-600 dark:text-purple-400 font-inter-semibold text-xs">Coming Soon</Text>
              </View>
            </View>

            <Text className="text-slate-500 dark:text-white/50 font-inter text-xs leading-relaxed mb-3">
              Unlock higher limits with automated BVN lookup against NIBSS and proof of address.
            </Text>

            <View className="flex-row gap-3">
              <View className="flex-1 bg-black/5 dark:bg-white/5 p-2.5 rounded-lg">
                <Text className="text-slate-400 dark:text-white/40 font-inter text-[10px] uppercase">Single Limit</Text>
                <Text className="text-slate-700 dark:text-white/80 font-inter-semibold text-xs mt-0.5">₦250,000</Text>
              </View>
              <View className="flex-1 bg-black/5 dark:bg-white/5 p-2.5 rounded-lg">
                <Text className="text-slate-400 dark:text-white/40 font-inter text-[10px] uppercase">Daily Limit</Text>
                <Text className="text-slate-700 dark:text-white/80 font-inter-semibold text-xs mt-0.5">₦1,000,000</Text>
              </View>
            </View>
          </GlassCard>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
