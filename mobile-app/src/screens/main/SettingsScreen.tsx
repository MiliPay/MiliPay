import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Switch, Alert, Modal, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { 
  ChevronRight, 
  Bell, 
  BellOff,
  Fingerprint, 
  Shield, 
  Lock, 
  Mail, 
  Phone, 
  LogOut, 
  HelpCircle,
  FileText,
  Info,
  Palette, X, Sun, Moon, Smartphone, Check, Trash2, Landmark, Building, Sliders,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useColorScheme } from 'nativewind';

import { useAuthStore, useBankStore } from '../../store/useStore';
import { GlassCard } from '../../components/ui/GlassCard';

// --- Reusable Setting Row ---
const SettingRow = ({ icon: Icon, label, subtitle, value, type = 'nav', danger = false, onPress, iconBg }: any) => {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme !== 'light';

  return (
    <Pressable 
      onPress={onPress}
      className="flex-row items-center py-3.5"
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      <View className={`w-9 h-9 rounded-xl items-center justify-center mr-3 ${iconBg || (danger ? (isDark ? 'bg-red-500/15' : 'bg-red-500/10') : (isDark ? 'bg-white/5' : 'bg-black/5'))}`}>
        <Icon color={danger ? '#ef4444' : (isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)')} size={18} />
      </View>
      <View className="flex-1">
        <Text className={`font-inter-medium text-[15px] ${danger ? 'text-red-500 dark:text-red-400' : 'text-slate-800 dark:text-white'}`}>
          {label}
        </Text>
        {subtitle && (
          <Text className="text-slate-500 dark:text-white/30 font-inter text-xs mt-0.5">{subtitle}</Text>
        )}
      </View>
      {type === 'switch' ? (
        <Switch 
          value={value} 
          onValueChange={onPress}
          trackColor={{ false: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', true: '#10b981' }}
          thumbColor="#fff"
        />
      ) : type === 'badge' ? (
        <View className="bg-emerald-500/15 px-2.5 py-1 rounded-lg">
          <Text className="text-emerald-600 dark:text-emerald-400 font-inter-semibold text-xs">{value}</Text>
        </View>
      ) : type === 'value' ? (
        <Text className="text-slate-400 dark:text-white/40 font-inter text-sm">{value}</Text>
      ) : !danger ? (
        <ChevronRight color={isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)"} size={18} />
      ) : null}
    </Pressable>
  );
};

// --- Section Divider ---
const SectionDivider = () => (
  <View className="h-px bg-black/5 dark:bg-white/5 mx-1" />
);

// --- Section Header ---
const SectionHeader = ({ title }: { title: string }) => (
  <Text className="text-slate-400 dark:text-white/40 font-inter-semibold uppercase tracking-widest text-[11px] mb-2 ml-1 mt-6">
    {title}
  </Text>
);

export default function SettingsScreen({ navigation }: any) {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const { linkedAccounts, unlinkAccount } = useBankStore();
  
  const { colorScheme, setColorScheme } = useColorScheme();
  const isDark = colorScheme !== 'light';

  const [biometricEnabled, setBiometricEnabled] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [isThemeModalVisible, setIsThemeModalVisible] = useState(false);
  const [activeTheme, setActiveTheme] = useState<'system' | 'light' | 'dark'>('system');
  const [isBankModalVisible, setIsBankModalVisible] = useState(false);
  const [accountToUnlink, setAccountToUnlink] = useState<any>(null);
  const [isUnlinking, setIsUnlinking] = useState(false);

  const applyTheme = (theme: 'system' | 'light' | 'dark') => {
    Haptics.selectionAsync();
    setActiveTheme(theme);
    setColorScheme(theme);
  };

  const handleLogout = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out of MiliPay?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Log Out', 
          style: 'destructive', 
          onPress: () => logout() 
        },
      ]
    );
  };

  const handleThemeChange = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsThemeModalVisible(true);
  };

  const activeAccounts = linkedAccounts.length;

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-black">
      <LinearGradient colors={isDark ? ['rgba(16, 185, 129, 0.08)', '#000'] : ['rgba(16, 185, 129, 0.08)', '#f8fafc']} className="absolute inset-0" />
      
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="px-6 pt-6 pb-2">
          <Text className="text-slate-900 dark:text-white font-inter-bold text-2xl tracking-tight">Settings</Text>
        </View>

        {/* Profile Card */}
        <View className="px-6 mt-4">
          <GlassCard intensity={isDark ? 15 : 40} className="p-0">
            <Pressable 
              onPress={() => navigation.navigate('ProfileSettings')}
              className="flex-row items-center py-2"
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <View className="w-14 h-14 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/20 dark:border-emerald-500/30 items-center justify-center mr-4">
                <Text className="text-emerald-600 dark:text-emerald-400 font-inter-bold text-lg">
                  {user?.initials || 'ME'}
                </Text>
              </View>
              <View className="flex-1">
                <Text className="text-slate-800 dark:text-white font-inter-bold text-lg">
                  {user?.firstName} {user?.lastName}
                </Text>
                <Text className="text-slate-500 dark:text-white/40 font-inter text-sm mt-0.5">
                  {user?.email || 'No email set'}
                </Text>
              </View>
              <ChevronRight color={isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)"} size={18} />
            </Pressable>
          </GlassCard>
        </View>

        {/* Account Info */}
        <View className="px-6">
          <SectionHeader title="Account" />
          <GlassCard intensity={isDark ? 15 : 40} className="p-0">
            <SettingRow 
              icon={Mail} 
              label="Email" 
              value={user?.email || 'Not set'}
              type="value"
              onPress={() => navigation.navigate('ProfileSettings')}
            />
            <SectionDivider />
            <SettingRow 
              icon={Phone} 
              label="Phone" 
              value={user?.phone || 'Not set'}
              type="value"
              onPress={() => navigation.navigate('ProfileSettings')}
            />
            <SectionDivider />
            <SettingRow 
              icon={Shield} 
              label="Linked Bank Accounts" 
              value={activeAccounts > 0 ? `${activeAccounts} Active` : 'None'}
              type="badge"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setIsBankModalVisible(true);
              }}
            />
          </GlassCard>
        </View>

        {/* Security */}
        <View className="px-6">
          <SectionHeader title="Security" />
          <GlassCard intensity={isDark ? 15 : 40} className="p-0">
            <SettingRow 
              icon={Fingerprint} 
              label="Biometric Login" 
              subtitle="Use fingerprint or face to sign in"
              type="switch" 
              value={biometricEnabled} 
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setBiometricEnabled(!biometricEnabled);
              }}
            />
            <SectionDivider />
            <SettingRow 
              icon={Lock} 
              label="Change PIN" 
              subtitle="Update your 4-digit transaction PIN"
            />
            <SectionDivider />
            <SettingRow 
              icon={Sliders} 
              label="Transaction Limits & PIN Security" 
              subtitle={`Tier ${user?.kycTier || 2} • PIN required over ₦${(user?.pinThreshold || 10000).toLocaleString()}`}
              type="nav"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate('AccountLimits');
              }}
            />
          </GlassCard>
        </View>

        {/* Preferences */}
        <View className="px-6">
          <SectionHeader title="Preferences" />
          <GlassCard intensity={isDark ? 15 : 40} className="p-0">
            <SettingRow 
              icon={notificationsEnabled ? Bell : BellOff} 
              label="Push Notifications" 
              subtitle="Transaction alerts and updates"
              type="switch" 
              value={notificationsEnabled} 
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setNotificationsEnabled(!notificationsEnabled);
              }}
            />
            <SectionDivider />
            <SettingRow 
              icon={Palette} 
              label="Theme" 
              value={activeTheme === 'dark' ? 'Dark' : activeTheme === 'light' ? 'Light' : 'System'}
              type="value"
              onPress={handleThemeChange}
            />
          </GlassCard>
        </View>

        {/* Support & Legal */}
        <View className="px-6">
          <SectionHeader title="Support" />
          <GlassCard intensity={isDark ? 15 : 40} className="p-0">
            <SettingRow 
              icon={HelpCircle} 
              label="Help & Support" 
              subtitle="FAQs and contact support"
              onPress={() => navigation.navigate('SupportScreen')}
            />
            <SectionDivider />
            <SettingRow 
              icon={FileText} 
              label="Terms of Service" 
            />
            <SectionDivider />
            <SettingRow 
              icon={FileText} 
              label="Privacy Policy" 
            />
          </GlassCard>
        </View>

        {/* Log Out */}
        <View className="px-6 mt-6 mb-4">
          <GlassCard intensity={isDark ? 15 : 40} className="p-0">
            <SettingRow 
              icon={LogOut} 
              label="Log Out" 
              danger={true}
              onPress={handleLogout}
            />
          </GlassCard>
        </View>

        {/* App Version */}
        <View className="items-center pb-12 mt-2">
          <View className="flex-row items-center">
            <Info color={isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)"} size={12} />
            <Text className="text-slate-400 dark:text-white/15 font-inter text-xs ml-1">MiliPay v1.0.0 (Sandbox)</Text>
          </View>
        </View>

      </ScrollView>
    
   {/* Crazy Centered Theme Modal */}
      <Modal
        visible={isThemeModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsThemeModalVisible(false)}
      >
        <View className="flex-1 justify-center items-center px-4">
          {/* Deep Blur Background */}
          <Pressable 
            className="absolute inset-0" 
            onPress={() => setIsThemeModalVisible(false)}
          >
            <BlurView intensity={isDark ? 40 : 20} tint={isDark ? 'dark' : 'light'} className="absolute inset-0" />
            <View className={`absolute inset-0 ${isDark ? 'bg-black/40' : 'bg-black/10'}`} />
          </Pressable>

          {/* The Crazy Card */}
          <View 
            className={`w-full rounded-[40px] overflow-hidden border ${isDark ? 'bg-[#0f172a] border-white/10' : 'bg-white border-slate-200'}`}
            style={{
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.2,
              shadowRadius: 24,
              elevation: 10,
            }}
          >
            <LinearGradient 
              colors={isDark ? ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0)'] : ['rgba(16,185,129,0.03)', 'rgba(255,255,255,0)']} 
              className="absolute inset-0" 
            />
            
            <View className="p-8 pb-10">
              <View className="flex-row items-center justify-between mb-8">
                <View>
                  <Text className="text-slate-900 dark:text-white font-inter-bold text-3xl tracking-tight mb-1">Appearance</Text>
                  <Text className="text-slate-500 dark:text-white/50 font-inter text-sm">Choose your MiliPay aesthetic.</Text>
                </View>
                <Pressable 
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setIsThemeModalVisible(false);
                  }}
                  className="w-10 h-10 rounded-full bg-slate-100 dark:bg-white/10 items-center justify-center border border-slate-200 dark:border-white/10"
                  style={({pressed}) => ({ transform: [{scale: pressed ? 0.9 : 1}] })}
                >
                  <X color={isDark ? '#fff' : '#000'} size={20} />
                </Pressable>
              </View>

              {/* System Option - Full Width */}
              <Pressable 
                onPress={() => applyTheme('system')}
                style={({pressed}) => ({ transform: [{scale: pressed ? 0.97 : 1}] })}
                className={`w-full h-24 rounded-3xl mb-4 overflow-hidden border-2 ${activeTheme === 'system' ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-500/10' : 'border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-white/5'}`}
              >
                <LinearGradient colors={isDark ? ['#6366f1', '#a855f7'] : ['rgba(99,102,241,0.1)', 'rgba(168,85,247,0.1)']} start={{x:0,y:0}} end={{x:1,y:1}} className="absolute inset-0 opacity-20" />
                <View className="flex-1 flex-row items-center px-6">
                  <View className={`w-12 h-12 rounded-2xl items-center justify-center mr-4 ${activeTheme === 'system' ? 'bg-emerald-500/20' : 'bg-slate-200 dark:bg-white/10'}`}>
                    <Smartphone color={activeTheme === 'system' ? '#10b981' : (isDark ? '#fff' : '#000')} size={24} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-slate-900 dark:text-white font-inter-bold text-lg mb-0.5">System Match</Text>
                    <Text className="text-slate-500 dark:text-white/50 font-inter text-xs">Adapts to your device</Text>
                  </View>
                  {activeTheme === 'system' && (
                    <View 
                      className="w-8 h-8 rounded-full bg-emerald-500 items-center justify-center"
                      style={{
                        shadowColor: '#10b981',
                        shadowOffset: { width: 0, height: 0 },
                        shadowOpacity: 0.5,
                        shadowRadius: 8,
                        elevation: 4,
                      }}
                    >
                      <Check color="#fff" size={16} />
                    </View>
                  )}
                </View>
              </Pressable>

              {/* Light & Dark - Side by Side Grid */}
              <View className="flex-row justify-between h-40">
                
                {/* Light Option */}
                <Pressable 
                  onPress={() => applyTheme('light')}
                  style={({pressed}) => ({ transform: [{scale: pressed ? 0.95 : 1}] })}
                  className={`w-[48%] h-full rounded-3xl overflow-hidden border-2 p-4 justify-between ${activeTheme === 'light' ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-500/10' : 'border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-white/5'}`}
                >
                  <LinearGradient colors={['rgba(253,251,251,0.5)', 'rgba(235,237,238,0.5)']} className="absolute inset-0" />
                  <View className="flex-row items-start justify-between">
                    <View className="w-12 h-12 rounded-full bg-orange-500/10 border border-orange-500/20 items-center justify-center">
                      <Sun color="#f59e0b" size={24} fill="#f59e0b" />
                    </View>
                    {activeTheme === 'light' && (
                      <View 
                        className="w-6 h-6 rounded-full bg-emerald-500 items-center justify-center"
                        style={{
                          shadowColor: '#10b981',
                          shadowOffset: { width: 0, height: 0 },
                          shadowOpacity: 0.5,
                          shadowRadius: 6,
                          elevation: 3,
                        }}
                      >
                        <Check color="#fff" size={12} />
                      </View>
                    )}
                  </View>
                  <View>
                    <Text className="text-slate-900 dark:text-white font-inter-bold text-xl">Light</Text>
                    <Text className="text-slate-500 dark:text-white/50 font-inter text-xs mt-1">Clean & bright</Text>
                  </View>
                </Pressable>

                {/* Dark Option */}
                <Pressable 
                  onPress={() => applyTheme('dark')}
                  style={({pressed}) => ({ transform: [{scale: pressed ? 0.95 : 1}] })}
                  className={`w-[48%] h-full rounded-3xl overflow-hidden border-2 p-4 justify-between ${activeTheme === 'dark' ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-500/10' : 'border-slate-200 dark:border-white/5 bg-[#020617]'}`}
                >
                  <LinearGradient colors={['rgba(15,23,42,0.8)', 'rgba(2,6,23,0.8)']} className="absolute inset-0" />
                  <View className="absolute -top-10 -right-10 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl" />
                  <View className="flex-row items-start justify-between">
                    <View className="w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/20 items-center justify-center">
                      <Moon color="#3b82f6" size={24} fill="#3b82f6" />
                    </View>
                    {activeTheme === 'dark' && (
                      <View 
                        className="w-6 h-6 rounded-full bg-emerald-500 items-center justify-center"
                        style={{
                          shadowColor: '#10b981',
                          shadowOffset: { width: 0, height: 0 },
                          shadowOpacity: 0.5,
                          shadowRadius: 6,
                          elevation: 3,
                        }}
                      >
                        <Check color="#fff" size={12} />
                      </View>
                    )}
                  </View>
                  <View>
                    <Text className="text-slate-900 dark:text-white font-inter-bold text-xl">Dark</Text>
                    <Text className="text-slate-500 dark:text-white/50 font-inter text-xs mt-1">Sleek & deep</Text>
                  </View>
                </Pressable>

              </View>

            </View>
          </View>
        </View>
      </Modal>
    
            {/* Linked Bank Accounts Modal */}
      <Modal
        visible={isBankModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsBankModalVisible(false)}
      >
        <View className="flex-1 justify-end">
          <Pressable 
            className="absolute inset-0" 
            onPress={() => setIsBankModalVisible(false)}
          >
            <BlurView intensity={isDark ? 40 : 20} tint={isDark ? 'dark' : 'light'} className="absolute inset-0" />
            <View className={`absolute inset-0 ${isDark ? 'bg-black/40' : 'bg-black/10'}`} />
          </Pressable>

          <View 
            className={`w-full rounded-t-[40px] overflow-hidden border-t ${isDark ? 'bg-[#0f172a] border-white/10' : 'bg-white border-slate-200'} pb-10 min-h-[50%]`}
            style={{
              shadowColor: '#000',
              shadowOffset: { width: 0, height: -8 },
              shadowOpacity: 0.15,
              shadowRadius: 20,
              elevation: 8,
            }}
          >
            <LinearGradient 
              colors={isDark ? ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0)'] : ['rgba(16,185,129,0.03)', 'rgba(255,255,255,0)']} 
              className="absolute inset-0" 
            />
            
            <View className="p-8">
              <View className="flex-row items-center justify-between mb-8">
                <View>
                  <Text className="text-slate-900 dark:text-white font-inter-bold text-3xl tracking-tight mb-1">Linked Banks</Text>
                  <Text className="text-slate-500 dark:text-white/50 font-inter text-sm">Manage your connected accounts</Text>
                </View>
                <Pressable 
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setIsBankModalVisible(false);
                  }}
                  className="w-10 h-10 rounded-full bg-slate-100 dark:bg-white/10 items-center justify-center border border-slate-200 dark:border-white/10"
                >
                  <X color={isDark ? '#fff' : '#000'} size={20} />
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} className="max-h-96">
                {linkedAccounts.length === 0 ? (
                  <View className="items-center py-12">
                    <View className="w-20 h-20 rounded-full bg-emerald-500/10 items-center justify-center mb-4">
                      <Building color={isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)"} size={32} />
                    </View>
                    <Text className="text-slate-500 dark:text-white/40 font-inter-medium text-base">No banks linked yet.</Text>
                  </View>
                ) : (
                  linkedAccounts.map((acc, index) => (
                    <Pressable 
                      key={acc.id || index.toString()} 
                      className={`flex-row items-center justify-between p-5 mb-4 rounded-[28px] border ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200'}`}
                      style={{
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: 0.05,
                        shadowRadius: 2,
                        elevation: 1,
                      }}
                    >
                      <View className="flex-row items-center flex-1">
                        <View className="w-14 h-14 rounded-2xl bg-emerald-500/10 items-center justify-center mr-4 border border-emerald-500/20">
                          <Building color="#10b981" size={24} />
                        </View>
                        <View className="flex-1">
                          <Text className="text-slate-900 dark:text-white font-inter-bold text-lg mb-1">{acc.bankName}</Text>
                          <View className="flex-row items-center">
                            <View className="flex-row mr-2 space-x-0.5">
                              <View className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-white/40" />
                              <View className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-white/40" />
                              <View className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-white/40" />
                              <View className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-white/40" />
                            </View>
                            <Text className="text-slate-500 dark:text-white/50 font-inter-medium text-sm tracking-widest">
                              {acc.accountNumber?.slice(-4) || '****'}
                            </Text>
                          </View>
                        </View>
                      </View>
                      
                      <Pressable 
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          setAccountToUnlink(acc);
                        }}
                        className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-500/10 items-center justify-center border border-red-100 dark:border-red-500/20 ml-2"
                        style={({pressed}) => ({ opacity: pressed ? 0.6 : 1, transform: [{scale: pressed ? 0.95 : 1}] })}
                      >
                        <Trash2 color="#ef4444" size={20} />
                      </Pressable>
                    </Pressable>
                  ))
                )}
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>

      {/* Custom Confirm Unlink Modal */}
      <Modal
        visible={!!accountToUnlink}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setAccountToUnlink(null)}
      >
        <View className="flex-1 justify-center items-center px-6">
          <Pressable 
            className="absolute inset-0" 
            onPress={() => setAccountToUnlink(null)}
          >
            <BlurView intensity={isDark ? 50 : 30} tint={isDark ? 'dark' : 'light'} className="absolute inset-0" />
            <View className={`absolute inset-0 ${isDark ? 'bg-black/60' : 'bg-black/20'}`} />
          </Pressable>

          <View 
            className={`w-full rounded-[36px] overflow-hidden border ${isDark ? 'bg-[#0f172a] border-white/10' : 'bg-white border-slate-200'}`}
            style={{
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.2,
              shadowRadius: 20,
              elevation: 8,
            }}
          >
            <View className="p-8 items-center">
              <View className="w-20 h-20 rounded-full bg-red-50 dark:bg-red-500/10 items-center justify-center mb-6 border border-red-100 dark:border-red-500/20">
                <Trash2 color="#ef4444" size={32} />
              </View>
              
              <Text className="text-slate-900 dark:text-white font-inter-bold text-2xl text-center mb-3">Remove Bank?</Text>
              <Text className="text-slate-500 dark:text-white/60 font-inter text-center text-sm mb-8 leading-relaxed px-2">
                Are you sure you want to unlink your <Text className="font-inter-bold text-slate-700 dark:text-white/90">{accountToUnlink?.bankName}</Text> account? You won't be able to use it for transactions.
              </Text>

              <View className="w-full flex-row justify-between">
                <Pressable 
                  disabled={isUnlinking}
                  onPress={() => {
                    if (!isUnlinking) {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setAccountToUnlink(null);
                    }
                  }}
                  className={`w-[48%] h-14 rounded-2xl items-center justify-center border ${isDark ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200'} ${isUnlinking ? 'opacity-40' : ''}`}
                >
                  <Text className="text-slate-700 dark:text-white font-inter-semibold text-base">Cancel</Text>
                </Pressable>
                
                <Pressable 
                  disabled={isUnlinking}
                  onPress={async () => {
                    if (accountToUnlink && !isUnlinking) {
                      setIsUnlinking(true);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      const targetId = accountToUnlink.id;
                      await unlinkAccount(targetId);
                      setIsUnlinking(false);
                      setAccountToUnlink(null);
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    }
                  }}
                  className={`w-[48%] h-14 rounded-2xl bg-red-500 items-center justify-center ${isUnlinking ? 'opacity-80' : ''}`}
                  style={{
                    shadowColor: '#ef4444',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.3,
                    shadowRadius: 6,
                    elevation: 3,
                  }}
                >
                  {isUnlinking ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text className="text-white font-inter-bold text-base">Remove</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
