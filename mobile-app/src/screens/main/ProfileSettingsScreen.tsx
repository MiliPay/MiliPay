import React, { useState } from 'react';
import { useColorScheme } from 'nativewind';
import { View, Text, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, Camera, User, Mail, Phone, Lock, Check, MapPin, ShieldCheck, Sliders, ChevronRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { useAuthStore } from '../../store/useStore';

export default function ProfileSettingsScreen({ navigation }: any) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme !== 'light';

  const user = useAuthStore((state) => state.user);
  
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [address, setAddress] = useState(user?.address || '');
  
  // Mask the real NIN or show a placeholder if none exists
  const displayNin = user?.nin 
    ? `•••• •••• ${user.nin.slice(-4)}` 
    : 'Not provided';
  const [nin, setNin] = useState(displayNin);
  
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setIsSaving(true);
    
    setTimeout(() => {
      setIsSaving(false);
      navigation.goBack();
    }, 1000);
  };

  const handlePickImage = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    console.log("Open image picker");
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-black">
      <LinearGradient colors={isDark ? ['rgba(0, 200, 150, 0.08)', '#000'] : ['rgba(0, 200, 150, 0.08)', '#f8fafc']} className="absolute inset-0" />
      
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        {/* Header */}
        <View className="px-6 pt-6 pb-2 flex-row items-center justify-between z-10">
          <Pressable 
            onPress={() => navigation.goBack()} 
            className="w-10 h-10 items-center justify-center rounded-full bg-black/5 dark:bg-white/10 border border-slate-200 dark:border-white/10 active:bg-black/10 dark:active:bg-white/20"
          >
            <ChevronLeft color={isDark ? "#fff" : "#000"} size={20} />
          </Pressable>
          <Text className="text-slate-900 dark:text-white font-inter-bold text-lg tracking-wide">Profile & Identity</Text>
          <View className="w-10" />
        </View>

        <ScrollView className="flex-1 px-6 pt-6" showsVerticalScrollIndicator={false}>
          
          {/* Avatar Section */}
          <View className="items-center mt-2 mb-10">
            <View className="relative">
              {/* Soft glow behind avatar */}
              <View className="absolute inset-0 bg-signal/20 rounded-full blur-xl scale-110" />
              
              <View className="w-28 h-28 rounded-full bg-white dark:bg-[#111318] border border-slate-200 dark:border-white/10 items-center justify-center z-10">
                <Text className="text-signal-bright font-inter-bold text-4xl tracking-tight">
                  {user?.initials || 'ME'}
                </Text>
              </View>
              
              <Pressable 
                onPress={handlePickImage}
                className="absolute bottom-0 right-0 w-9 h-9 bg-signal rounded-full border-[3px] border-black items-center justify-center z-20"
                style={{ shadowColor: '#00C896', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 3 }}
              >
                <Camera color="#111827" size={14} strokeWidth={2.5} />
              </Pressable>
            </View>
            <Text className="text-slate-500 dark:text-white/60 font-inter-medium text-xs mt-4">Change Picture</Text>
          </View>

          {/* Form Fields */}
          <View className="mb-8">
            <Text className="text-slate-500 dark:text-white/60 font-inter-semibold uppercase tracking-widest text-[10px] mb-3 ml-2">
              Personal Details
            </Text>
            <View className="bg-white dark:bg-[#111318] border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden">
              {/* First Name */}
              <View className="flex-row items-center px-4 h-14 border-b border-slate-200 dark:border-white/10">
                <User color={isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)"} size={18} />
                <TextInput
                  className="flex-1 text-slate-900 dark:text-white font-inter ml-3 text-sm"
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="First Name"
                  placeholderTextColor={isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)"}
                />
              </View>
              {/* Last Name */}
              <View className="flex-row items-center px-4 h-14">
                <User color={isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)"} size={18} />
                <TextInput
                  className="flex-1 text-slate-900 dark:text-white font-inter ml-3 text-sm"
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder="Last Name"
                  placeholderTextColor={isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)"}
                />
              </View>
            </View>
          </View>

          <View className="mb-8">
            <Text className="text-slate-500 dark:text-white/60 font-inter-semibold uppercase tracking-widest text-[10px] mb-3 ml-2">
              Contact Information
            </Text>
            <View className="bg-white dark:bg-[#111318] border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden">
              {/* Email */}
              <View className="flex-row items-center px-4 h-14 border-b border-slate-200 dark:border-white/10">
                <Mail color={isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)"} size={18} />
                <TextInput
                  className="flex-1 text-slate-500 dark:text-white/60 font-inter ml-3 text-sm"
                  value={email}
                  editable={false}
                  placeholder="Email"
                  placeholderTextColor={isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)"}
                />
                <Lock color={isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)"} size={14} />
              </View>
              {/* Phone */}
              <View className="flex-row items-center px-4 h-14">
                <Phone color={isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)"} size={18} />
                <TextInput
                  className="flex-1 text-slate-500 dark:text-white/60 font-inter ml-3 text-sm"
                  value={phone}
                  editable={false}
                  placeholder="Phone"
                  placeholderTextColor={isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)"}
                />
                <Lock color={isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)"} size={14} />
              </View>
            </View>
          </View>

          <View className="mb-10">
            <Text className="text-slate-500 dark:text-white/60 font-inter-semibold uppercase tracking-widest text-[10px] mb-3 ml-2">
              Identity & Address
            </Text>
            <View className="bg-white dark:bg-[#111318] border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden">
              {/* Address */}
              <View className="flex-row items-center px-4 h-14 border-b border-slate-200 dark:border-white/10">
                <MapPin color={isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)"} size={18} />
                <TextInput
                  className="flex-1 text-slate-900 dark:text-white font-inter ml-3 text-sm"
                  value={address}
                  onChangeText={setAddress}
                  placeholder="Residential Address"
                  placeholderTextColor={isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)"}
                />
              </View>
              {/* NIN */}
              <View className="flex-row items-center px-4 h-14">
                <ShieldCheck color={isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)"} size={18} />
                <TextInput
                  className="flex-1 text-signal-bright/80 font-inter-medium ml-3 text-sm tracking-widest"
                  value={nin}
                  editable={false}
                  placeholder="NIN"
                  placeholderTextColor={isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)"}
                />
                <Lock color={isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)"} size={14} />
              </View>
            </View>
            <Text className="text-slate-500 dark:text-white/60 font-inter-medium text-[10px] mt-3 ml-2">
              Your National Identity Number (NIN) is verified and securely encrypted.
            </Text>
          </View>

          {/* Transaction Limits & PIN Security */}
          <View className="mb-8">
            <Text className="text-slate-500 dark:text-white/60 font-inter-semibold uppercase tracking-widest text-[10px] mb-3 ml-2">
              Security & Limits
            </Text>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate('AccountLimits');
              }}
              className="bg-white dark:bg-[#111318] border border-slate-200 dark:border-white/10 rounded-2xl p-4 flex-row items-center justify-between active:opacity-70"
            >
              <View className="flex-row items-center flex-1 mr-3">
                <View className="w-10 h-10 rounded-xl bg-signal/10 dark:bg-signal/20 items-center justify-center mr-3 border border-signal/20">
                  <Sliders color="#00C896" size={18} />
                </View>
                <View className="flex-1">
                  <Text className="text-slate-900 dark:text-white font-inter-bold text-sm">
                    Transaction Limits & PIN Security
                  </Text>
                  <Text className="text-slate-500 dark:text-white/50 font-inter text-xs mt-0.5">
                    Tier {user?.kycTier || 2} • PIN required over ₦{(user?.pinThreshold || 10000).toLocaleString()}
                  </Text>
                </View>
              </View>
              <ChevronRight color={isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)"} size={18} />
            </Pressable>
          </View>

          {/* Save Button */}
          <Pressable 
            onPress={handleSave}
            disabled={isSaving}
            className={`h-14 rounded-2xl items-center justify-center flex-row mb-12 ${isSaving ? 'bg-signal/50' : 'bg-signal active:bg-signal'}`}
          >
            <Text className="text-[#000] font-inter-bold text-sm tracking-wide mr-2">
              {isSaving ? 'Saving Changes...' : 'Save Changes'}
            </Text>
            {!isSaving ? <Check color="#000" size={18} strokeWidth={3} /> : null}
          </Pressable>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
