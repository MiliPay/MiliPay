import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  ScrollView, 
  Pressable, 
  TextInput, 
  Alert, 
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Check, ShieldCheck, AlertCircle, Lock } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useColorScheme } from 'nativewind';

import { useAuthStore } from '../../store/useStore';

const PRESETS = [
  { label: '₦5,000', value: 5000 },
  { label: '₦10,000', value: 10000 },
  { label: '₦25,000', value: 25000 },
  { label: '₦50,000', value: 50000 },
  { label: '₦150,000', value: 150000 },
];

/**
 * Tier ceilings, mirrored from public.tier_caps and
 * supabase/functions/_shared/limits.ts. Display only — every limit is clamped
 * again server-side, so a stale copy here cannot raise anyone's cap.
 */
const TIER_CAPS: Record<number, { maxSingle: number; maxDaily: number }> = {
  1: { maxSingle: 50000, maxDaily: 200000 },
  2: { maxSingle: 150000, maxDaily: 500000 },
  3: { maxSingle: 250000, maxDaily: 1000000 },
};

export default function AccountLimitsScreen({ navigation }: any) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme !== 'light';

  const user = useAuthStore((state) => state.user);
  const onboarding = useAuthStore((state) => state.onboarding);
  const updatePinThreshold = useAuthStore((state) => state.updatePinThreshold);
  const setTransactionLimits = useAuthStore((state) => state.setTransactionLimits);

  const tier = onboarding?.kycTier ?? user?.kycTier ?? 2;
  const caps = TIER_CAPS[tier] ?? TIER_CAPS[2];

  // null means "no personal limit set", so the tier ceiling applies.
  const currentSingle = onboarding?.singleLimit ?? caps.maxSingle;
  const currentDaily = onboarding?.dailyLimit ?? caps.maxDaily;

  const initialThreshold = user?.pinThreshold || 10000;
  const [selectedAmount, setSelectedAmount] = useState<number>(initialThreshold);
  const [customAmount, setCustomAmount] = useState<string>(initialThreshold.toLocaleString());
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const [singleLimit, setSingleLimit] = useState<number>(currentSingle);
  const [dailyLimit, setDailyLimit] = useState<number>(currentDaily);
  const [isSavingLimits, setIsSavingLimits] = useState(false);
  const [limitsError, setLimitsError] = useState<string | null>(null);

  // The PIN threshold can never exceed the single-transaction limit, or there
  // would be no amount that both clears the limit and triggers the PIN.
  const thresholdCeiling = Math.min(caps.maxSingle, singleLimit || caps.maxSingle);

  const isModified = selectedAmount !== initialThreshold;
  const isOverLimit = selectedAmount > thresholdCeiling;
  const isInvalid = !selectedAmount || selectedAmount <= 0;

  const limitsModified = singleLimit !== currentSingle || dailyLimit !== currentDaily;

  useEffect(() => {
    if (user?.pinThreshold) {
      setSelectedAmount(user.pinThreshold);
      setCustomAmount(user.pinThreshold.toLocaleString());
    }
  }, [user?.pinThreshold]);

  useEffect(() => {
    setSingleLimit(currentSingle);
    setDailyLimit(currentDaily);
  }, [currentSingle, currentDaily]);

  const handleSaveLimits = async () => {
    setLimitsError(null);

    if (singleLimit <= 0 || dailyLimit <= 0) {
      setLimitsError('Limits must be greater than zero.');
      return;
    }
    if (singleLimit > caps.maxSingle) {
      setLimitsError(`Single-transaction limit cannot exceed your Tier ${tier} cap of ₦${caps.maxSingle.toLocaleString()}.`);
      return;
    }
    if (dailyLimit > caps.maxDaily) {
      setLimitsError(`Daily limit cannot exceed your Tier ${tier} cap of ₦${caps.maxDaily.toLocaleString()}.`);
      return;
    }
    if (singleLimit > dailyLimit) {
      setLimitsError('Single-transaction limit cannot exceed your daily limit.');
      return;
    }

    setIsSavingLimits(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await setTransactionLimits(singleLimit, dailyLimit);
    setIsSavingLimits(false);

    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowSuccessModal(true);
    } else {
      setLimitsError(result.error || 'Could not update your limits. Please try again.');
    }
  };

  const handleSelectPreset = (value: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedAmount(value);
    setCustomAmount(value.toLocaleString());
  };

  const handleAmountChange = (text: string) => {
    const raw = text.replace(/[^0-9]/g, '');
    const num = parseInt(raw, 10);
    if (!isNaN(num)) {
      setSelectedAmount(num);
      setCustomAmount(num.toLocaleString());
    } else {
      setSelectedAmount(0);
      setCustomAmount('');
    }
  };

  const handleSave = async () => {
    const amount = selectedAmount;

    if (!amount || amount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid threshold amount.');
      return;
    }

    if (amount > thresholdCeiling) {
      Alert.alert(
        'Limit Exceeded',
        `Your PIN threshold cannot exceed your single-transaction limit of ₦${thresholdCeiling.toLocaleString()}.`
      );
      return;
    }

    setIsSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const success = await updatePinThreshold(amount);
    setIsSaving(false);

    if (success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowSuccessModal(true);
    } else {
      Alert.alert('Update Failed', 'Unable to update threshold right now. Please check your network and try again.');
    }
  };

  return (
    <SafeAreaView 
      className="flex-1 bg-slate-50 dark:bg-black"
      style={{ backgroundColor: isDark ? '#000000' : '#f8fafc' }}
    >
      {/* Top App Bar */}
      <View className="flex-row items-center px-4 py-3 bg-white dark:bg-black border-b border-slate-100 dark:border-zinc-800">
        <Pressable 
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            if (navigation?.goBack) {
              navigation.goBack();
            }
          }}
          hitSlop={12}
          className="p-1 -ml-1 mr-3"
        >
          <ChevronLeft color={isDark ? '#fff' : '#0f172a'} size={24} />
        </Pressable>
        <Text className="text-slate-900 dark:text-white font-inter-bold text-lg">
          Transaction Limits
        </Text>
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView 
          className="flex-1 px-5 pt-4"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Current Tier Overview (OPay Style Green Card) */}
          <View 
            className="bg-signal rounded-3xl p-6 mb-6"
            style={{
              shadowColor: '#0A6650',
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.25,
              shadowRadius: 12,
              elevation: 6,
            }}
          >
            <View className="flex-row items-center justify-between mb-4">
              <View className="flex-row items-center">
                <Text className="text-white font-inter-bold text-2xl mr-2.5">
                  Tier {tier}
                </Text>
                <View className="bg-signal-dim/80 px-3 py-1 rounded-full border border-signal/30">
                  <Text className="text-ink font-inter-semibold text-xs">
                    Current Level
                  </Text>
                </View>
              </View>
              <View className="flex-row items-center bg-white/20 px-3 py-1.5 rounded-xl border border-white/20">
                <ShieldCheck color="#fff" size={15} className="mr-1.5" />
                <Text className="text-white font-inter-bold text-xs">
                  Verified
                </Text>
              </View>
            </View>

            <View className="flex-row pt-4 border-t border-signal/50">
              <View className="flex-1">
                <Text className="text-ink font-inter-medium text-xs mb-1">
                  Daily Limit
                </Text>
                <Text className="text-white font-inter-bold text-2xl">
                  ₦{currentDaily.toLocaleString()}
                </Text>
                {onboarding?.dailyLimit != null && onboarding.dailyLimit < caps.maxDaily && (
                  <Text className="text-ink/70 font-inter text-[10px] mt-0.5">
                    you set this · cap ₦{caps.maxDaily.toLocaleString()}
                  </Text>
                )}
              </View>
              <View className="flex-1 pl-4 border-l border-signal/50">
                <Text className="text-ink font-inter-medium text-xs mb-1">
                  Single Limit
                </Text>
                <Text className="text-white font-inter-bold text-2xl">
                  ₦{currentSingle.toLocaleString()}
                </Text>
                {onboarding?.singleLimit != null && onboarding.singleLimit < caps.maxSingle && (
                  <Text className="text-ink/70 font-inter text-[10px] mt-0.5">
                    you set this · cap ₦{caps.maxSingle.toLocaleString()}
                  </Text>
                )}
              </View>
            </View>
          </View>

          {/* Customer-set transaction limits */}
          <View className="bg-white dark:bg-zinc-900 rounded-3xl p-6 mb-6 border border-slate-200 dark:border-zinc-800">
            <Text className="text-slate-900 dark:text-white font-inter-bold text-lg mb-1.5">
              Your Transaction Limits
            </Text>
            <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs leading-relaxed mb-5">
              Tighten your own limits below your Tier {tier} ceiling. You can lower them at
              any time; raising them past the ceiling needs a KYC upgrade.
            </Text>

            <LimitField
              label="Per transaction"
              value={singleLimit}
              cap={caps.maxSingle}
              isDark={isDark}
              onChange={setSingleLimit}
            />

            <View className="h-4" />

            <LimitField
              label="Per day"
              value={dailyLimit}
              cap={caps.maxDaily}
              isDark={isDark}
              onChange={setDailyLimit}
            />

            {limitsError && (
              <View className="flex-row items-start mt-3 px-1">
                <AlertCircle color="#ef4444" size={13} style={{ marginTop: 2 }} />
                <Text className="text-red-500 dark:text-red-400 font-inter-medium text-xs ml-1.5 flex-1">
                  {limitsError}
                </Text>
              </View>
            )}

            <Pressable
              onPress={handleSaveLimits}
              disabled={isSavingLimits || !limitsModified}
              className={`h-14 rounded-2xl flex-row items-center justify-center mt-5 ${
                !limitsModified
                  ? 'bg-slate-200 dark:bg-zinc-800 opacity-60'
                  : 'bg-signal active:bg-signal'
              } ${isSavingLimits ? 'opacity-70' : ''}`}
            >
              {isSavingLimits ? (
                <ActivityIndicator color="#000" size="small" />
              ) : (
                <View className="flex-row items-center">
                  <Check color="#000" size={18} strokeWidth={2.5} />
                  <Text className="text-black font-inter-bold text-base ml-2">Save limits</Text>
                </View>
              )}
            </Pressable>
          </View>

          {/* Payment PIN Security Section */}
          <View className="bg-white dark:bg-zinc-900 rounded-3xl p-6 mb-6 border border-slate-200 dark:border-zinc-800">
            <Text className="text-slate-900 dark:text-white font-inter-bold text-lg mb-1.5">
              PIN Security Threshold
            </Text>
            <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs leading-relaxed mb-4">
              Transactions above this amount will require your 4-digit PIN on payment terminals. Transactions below this approve with your palm scan alone.
            </Text>

            {/* Custom Amount Input */}
            <View className={`flex-row items-center h-14 px-4 rounded-2xl bg-slate-50 dark:bg-zinc-800 border ${
              isOverLimit 
                ? 'border-amber-500' 
                : 'border-slate-200 dark:border-zinc-700'
            } mb-2`}>
              <Text className="text-slate-500 dark:text-zinc-400 font-inter-bold text-base mr-2">
                ₦
              </Text>
              <TextInput
                value={customAmount}
                onChangeText={handleAmountChange}
                keyboardType="number-pad"
                placeholder="10,000"
                placeholderTextColor={isDark ? '#52525b' : '#94a3b8'}
                className="flex-1 text-slate-900 dark:text-white font-inter-bold text-base"
              />
            </View>

            {/* Inline warning for exceeding tier limit */}
            {isOverLimit && (
              <View className="flex-row items-center mb-3 px-1">
                <AlertCircle color="#f59e0b" size={13} />
                <Text className="text-amber-600 dark:text-amber-400 font-inter-medium text-xs ml-1.5">
                  Threshold cannot exceed your single-transaction limit of ₦{thresholdCeiling.toLocaleString()}
                </Text>
              </View>
            )}

            {/* Quick Preset Chips */}
            <View className="flex-row flex-wrap gap-2.5 mb-6 mt-2">
              {PRESETS.map((item) => {
                const isSelected = selectedAmount === item.value;
                return (
                  <Pressable
                    key={item.value}
                    onPress={() => handleSelectPreset(item.value)}
                    className={`px-4 py-2.5 rounded-2xl border ${
                      isSelected
                        ? 'bg-signal border-signal'
                        : 'bg-slate-50 dark:bg-zinc-800 border-slate-200 dark:border-zinc-700'
                    }`}
                  >
                    <Text
                      className={`text-xs ${
                        isSelected
                          ? 'text-black font-inter-bold'
                          : 'text-slate-700 dark:text-zinc-300 font-inter-semibold'
                      }`}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Enhanced OPay-Standard Save Button */}
            <Pressable
              onPress={handleSave}
              disabled={isSaving || isOverLimit || isInvalid}
              className={`h-14 rounded-2xl flex-row items-center justify-center ${
                isOverLimit || isInvalid
                  ? 'bg-slate-200 dark:bg-zinc-800 opacity-60'
                  : 'bg-signal active:bg-signal'
              } ${isSaving ? 'opacity-70' : ''}`}
              style={{
                shadowColor: isOverLimit || isInvalid ? 'transparent' : '#00C896',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.25,
                shadowRadius: 8,
                elevation: isOverLimit || isInvalid ? 0 : 4,
              }}
            >
              {isSaving ? (
                <View className="flex-row items-center">
                  <ActivityIndicator color="#000" size="small" />
                  <Text className="text-black font-inter-bold text-sm ml-2">
                    Saving Changes...
                  </Text>
                </View>
              ) : (
                <View className="flex-row items-center">
                  <Check color="#000" size={18} strokeWidth={2.5} />
                  <Text className="text-black font-inter-bold text-base ml-2">
                    {isModified ? `Save Changes (₦${selectedAmount.toLocaleString()})` : 'Save Changes'}
                  </Text>
                </View>
              )}
            </Pressable>

            {/* Instant Terminal Sync Assurance */}
            <View className="flex-row items-center justify-center mt-3">
              <Lock color={isDark ? '#71717a' : '#94a3b8'} size={12} />
              <Text className="text-slate-400 dark:text-zinc-500 font-inter text-[11px] ml-1.5">
                Takes effect immediately on all MiliPay POS terminals
              </Text>
            </View>
          </View>

          {/* Account Tiers Overview (OPay Comparison Format) */}
          <View className="mb-10">
            <Text className="text-slate-900 dark:text-white font-inter-bold text-base mb-3 px-1">
              Account Tiers
            </Text>

            {/* Tier 1 */}
            <View className="bg-white dark:bg-zinc-900 rounded-2xl p-4 mb-3 border border-slate-200 dark:border-zinc-800">
              <View className="flex-row items-center justify-between mb-1.5">
                <Text className="text-slate-900 dark:text-white font-inter-bold text-sm">
                  Tier 1 (Basic)
                </Text>
                <Text className="text-slate-400 dark:text-zinc-500 font-inter-medium text-xs">
                  Completed
                </Text>
              </View>
              <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs mb-3">
                Phone Number & Basic Profile
              </Text>
              <View className="flex-row gap-5 pt-2.5 border-t border-slate-100 dark:border-zinc-800">
                <Text className="text-slate-600 dark:text-zinc-400 font-inter text-xs">
                  Daily: <Text className="font-inter-semibold text-slate-900 dark:text-white">₦200,000</Text>
                </Text>
                <Text className="text-slate-600 dark:text-zinc-400 font-inter text-xs">
                  Single: <Text className="font-inter-semibold text-slate-900 dark:text-white">₦50,000</Text>
                </Text>
              </View>
            </View>

            {/* Tier 2 (Current Active) */}
            <View className="bg-white dark:bg-zinc-900 rounded-2xl p-4 mb-3 border-2 border-signal">
              <View className="flex-row items-center justify-between mb-1.5">
                <View className="flex-row items-center">
                  <Text className="text-slate-900 dark:text-white font-inter-bold text-sm mr-2">
                    Tier 2 (Biometric)
                  </Text>
                  <View className="bg-signal/15 px-2 py-0.5 rounded-full">
                    <Text className="text-signal-dim dark:text-signal-bright font-inter-bold text-[10px]">
                      Current Level
                    </Text>
                  </View>
                </View>
                <Check color="#00C896" size={18} strokeWidth={2.5} />
              </View>
              <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs mb-3">
                Confirmed NIN & Palm Vein Enrollment
              </Text>
              <View className="flex-row gap-5 pt-2.5 border-t border-slate-100 dark:border-zinc-800">
                <Text className="text-slate-600 dark:text-zinc-400 font-inter text-xs">
                  Daily: <Text className="font-inter-semibold text-slate-900 dark:text-white">₦500,000</Text>
                </Text>
                <Text className="text-slate-600 dark:text-zinc-400 font-inter text-xs">
                  Single: <Text className="font-inter-semibold text-slate-900 dark:text-white">₦150,000</Text>
                </Text>
              </View>
            </View>

            {/* Tier 3 */}
            <View className="bg-white dark:bg-zinc-900 rounded-2xl p-4 mb-3 border border-slate-200 dark:border-zinc-800 opacity-80">
              <View className="flex-row items-center justify-between mb-1.5">
                <Text className="text-slate-900 dark:text-white font-inter-bold text-sm">
                  Tier 3 (Enterprise)
                </Text>
                <View className="bg-slate-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
                  <Text className="text-slate-600 dark:text-zinc-400 font-inter-medium text-[10px]">
                    Coming Soon
                  </Text>
                </View>
              </View>
              <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs mb-3">
                BVN Verification & Proof of Address
              </Text>
              <View className="flex-row gap-5 pt-2.5 border-t border-slate-100 dark:border-zinc-800">
                <Text className="text-slate-600 dark:text-zinc-400 font-inter text-xs">
                  Daily: <Text className="font-inter-semibold text-slate-900 dark:text-white">₦1,000,000</Text>
                </Text>
                <Text className="text-slate-600 dark:text-zinc-400 font-inter text-xs">
                  Single: <Text className="font-inter-semibold text-slate-900 dark:text-white">₦250,000</Text>
                </Text>
              </View>
            </View>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* Success Modal (OPay Fintech Standard Popup) */}
      <Modal
        visible={showSuccessModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowSuccessModal(false)}
      >
        <View className="flex-1 justify-center items-center px-6 bg-black/60">
          <Pressable 
            className="absolute inset-0" 
            onPress={() => setShowSuccessModal(false)} 
          />

          <View 
            className="w-full max-w-sm rounded-3xl p-6 items-center bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800"
            style={{
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 12 },
              shadowOpacity: 0.25,
              shadowRadius: 24,
              elevation: 10,
            }}
          >
            {/* Green Badge with Ring */}
            <View className="w-20 h-20 rounded-full bg-signal/15 dark:bg-signal/20 items-center justify-center mb-4">
              <View
                className="w-13 h-13 rounded-full bg-signal items-center justify-center"
                style={{
                  shadowColor: '#00C896',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 8,
                  elevation: 6,
                }}
              >
                <Check color="#000" size={28} strokeWidth={3} />
              </View>
            </View>

            {/* Modal Title & Description */}
            <Text className="text-slate-900 dark:text-white font-inter-bold text-xl text-center mb-1.5">
              Changes Saved
            </Text>
            <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs text-center leading-relaxed mb-5 px-2">
              Your biometric payment security threshold has been updated and synchronized with the payment network.
            </Text>

            {/* Summary Breakdown Card (OPay Confirmation Slip) */}
            <View className="w-full rounded-2xl bg-slate-50 dark:bg-zinc-800/60 p-4 border border-slate-200/80 dark:border-zinc-700/60 mb-5">
              <View className="flex-row items-center justify-between mb-2.5">
                <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs">
                  New PIN Threshold
                </Text>
                <Text className="text-signal-dim dark:text-signal-bright font-inter-bold text-base">
                  ₦{selectedAmount.toLocaleString()}
                </Text>
              </View>

              <View className="h-px bg-slate-200/80 dark:bg-zinc-700/60 mb-2.5" />

              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs">
                  Palm Scan Only
                </Text>
                <Text className="text-slate-800 dark:text-zinc-200 font-inter-semibold text-xs">
                  Up to ₦{selectedAmount.toLocaleString()}
                </Text>
              </View>

              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs">
                  PIN Verification
                </Text>
                <Text className="text-slate-800 dark:text-zinc-200 font-inter-semibold text-xs">
                  Above ₦{selectedAmount.toLocaleString()}
                </Text>
              </View>

              <View className="h-px bg-slate-200/80 dark:bg-zinc-700/60 mb-2.5" />

              <View className="flex-row items-center justify-between">
                <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs">
                  Network Status
                </Text>
                <View className="flex-row items-center">
                  <View className="w-2 h-2 rounded-full bg-signal mr-1.5" />
                  <Text className="text-signal-dim dark:text-signal-bright font-inter-semibold text-xs">
                    Active on all POS
                  </Text>
                </View>
              </View>
            </View>

            {/* Done Action Button */}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowSuccessModal(false);
              }}
              className="w-full h-13 rounded-xl bg-signal active:bg-signal items-center justify-center"
              style={{
                shadowColor: '#00C896',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.2,
                shadowRadius: 6,
                elevation: 3,
              }}
            >
              <Text className="text-black font-inter-bold text-base">
                Done
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/**
 * One editable limit, shown against its tier ceiling.
 *
 * Deliberately permits typing a number above the cap so the inline validation
 * can explain why it is refused, rather than silently swallowing keystrokes.
 */
function LimitField({
  label,
  value,
  cap,
  isDark,
  onChange,
}: {
  label: string;
  value: number;
  cap: number;
  isDark: boolean;
  onChange: (next: number) => void;
}) {
  const [text, setText] = useState<string>(value ? value.toLocaleString() : '');

  useEffect(() => {
    setText(value ? value.toLocaleString() : '');
  }, [value]);

  const handleChange = (input: string) => {
    const digits = input.replace(/[^0-9]/g, '');
    const parsed = parseInt(digits, 10);
    if (Number.isNaN(parsed)) {
      setText('');
      onChange(0);
      return;
    }
    setText(parsed.toLocaleString());
    onChange(parsed);
  };

  const overCap = value > cap;

  return (
    <View>
      <View className="flex-row items-center justify-between mb-1.5 px-1">
        <Text className="text-slate-700 dark:text-slate-300 font-inter-medium text-sm">
          {label}
        </Text>
        <Text className="text-slate-400 dark:text-zinc-500 font-inter text-[11px]">
          max ₦{cap.toLocaleString()}
        </Text>
      </View>
      <View
        className={`flex-row items-center h-14 px-4 rounded-2xl bg-slate-50 dark:bg-zinc-800 border ${
          overCap ? 'border-red-500' : 'border-slate-200 dark:border-zinc-700'
        }`}
      >
        <Text className="text-slate-500 dark:text-zinc-400 font-inter-bold text-base mr-2">₦</Text>
        <TextInput
          value={text}
          onChangeText={handleChange}
          keyboardType="number-pad"
          placeholder={cap.toLocaleString()}
          placeholderTextColor={isDark ? '#52525b' : '#94a3b8'}
          className="flex-1 text-slate-900 dark:text-white font-inter-bold text-base"
          accessibilityLabel={label}
        />
      </View>
    </View>
  );
}
