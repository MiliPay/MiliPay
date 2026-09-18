import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Modal,
  Platform,
  KeyboardAvoidingView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  Check,
  Smartphone,
  Wifi,
  Lightbulb,
  Tv,
  CreditCard,
  Zap,
  ShieldCheck,
  Lock,
  Copy,
  CheckCheck,
  FileText,
  Share2,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { useColorScheme } from 'nativewind';

import { useAuthStore, useBankStore, useTransactionStore } from '../../store/useStore';
import { shareReceiptAsPdf, shareReceiptAsImage } from '../../lib/receiptSharing';
import { supabase } from '../../lib/supabase';
import { fetchDynamicVariations, executeVtuRecharge, DynamicVariation } from '../../lib/vtuService';

// Telco Configuration
const TELCOS = [
  { id: 'mtn', name: 'MTN', color: '#eab308', bg: 'bg-yellow-500/15', border: 'border-yellow-500', text: 'text-yellow-600 dark:text-yellow-400', badge: 'bg-yellow-500' },
  { id: 'airtel', name: 'Airtel', color: '#ef4444', bg: 'bg-red-500/15', border: 'border-red-500', text: 'text-red-600 dark:text-red-400', badge: 'bg-red-500' },
  { id: 'glo', name: 'Glo', color: '#22c55e', bg: 'bg-emerald-500/15', border: 'border-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', badge: 'bg-emerald-500' },
  { id: '9mobile', name: '9mobile', color: '#16a34a', bg: 'bg-green-600/15', border: 'border-green-600', text: 'text-green-700 dark:text-green-400', badge: 'bg-green-600' },
];

// Electricity Discos
const DISCOS = [
  { id: 'ikedc', name: 'Ikeja Electric (IKEDC)', short: 'IKEDC' },
  { id: 'ekedc', name: 'Eko Electric (EKEDC)', short: 'EKEDC' },
  { id: 'aedc', name: 'Abuja Electric (AEDC)', short: 'AEDC' },
  { id: 'ibedc', name: 'Ibadan Electric (IBEDC)', short: 'IBEDC' },
  { id: 'phed', name: 'Port Harcourt (PHED)', short: 'PHED' },
  { id: 'eedc', name: 'Enugu Electric (EEDC)', short: 'EEDC' },
  { id: 'kedco', name: 'Kano Electric (KEDCO)', short: 'KEDCO' },
];

// Cable Providers (Dynamic live bouquets pulled via VTPass Variations API)
const CABLE_PROVIDERS = [
  { id: 'dstv', name: 'DSTV' },
  { id: 'gotv', name: 'GOtv' },
  { id: 'startimes', name: 'StarTimes' },
];

const AIRTIME_PRESETS = [100, 200, 500, 1000, 2000, 5000];
const POWER_PRESETS = [1000, 2000, 5000, 10000, 20000];

// Telco Prefix Auto-detection
function detectTelcoFromPrefix(phone: string): string | null {
  const clean = phone.replace(/[^0-9]/g, '');
  if (clean.length < 4) return null;
  const prefix = clean.startsWith('234') ? '0' + clean.slice(3, 6) : clean.slice(0, 4);

  const mtnPrefixes = ['0803', '0806', '0703', '0706', '0813', '0816', '0810', '0814', '0903', '0906', '0913', '0916'];
  const airtelPrefixes = ['0802', '0808', '0708', '0812', '0701', '0902', '0901', '0907', '0912'];
  const gloPrefixes = ['0805', '0807', '0705', '0815', '0811', '0905', '0915'];
  const nineMobilePrefixes = ['0809', '0817', '0818', '0909', '0908'];

  if (mtnPrefixes.includes(prefix)) return 'mtn';
  if (airtelPrefixes.includes(prefix)) return 'airtel';
  if (gloPrefixes.includes(prefix)) return 'glo';
  if (nineMobilePrefixes.includes(prefix)) return '9mobile';
  return null;
}

export default function QuickServiceScreen({ route, navigation }: any) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';

  const user = useAuthStore((state) => state.user);
  const { linkedAccounts, activeBankIndex, setActiveBankIndex } = useBankStore();
  const [selectedBankIndex, setSelectedBankIndex] = useState<number>(activeBankIndex || 0);
  const recordBillPayment = useTransactionStore((state) => state.recordBillPayment);

  useEffect(() => {
    if (activeBankIndex >= 0 && activeBankIndex < linkedAccounts.length) {
      setSelectedBankIndex(activeBankIndex);
    }
  }, [activeBankIndex, linkedAccounts.length]);

  const initialServiceType = route?.params?.serviceType || 'airtime';
  const [serviceType, setServiceType] = useState<string>(initialServiceType);

  // Telco selection
  const [selectedTelco, setSelectedTelco] = useState<string>('mtn');

  // Input states
  const [recipientNumber, setRecipientNumber] = useState<string>('');
  const [selectedAmount, setSelectedAmount] = useState<number>(1000);
  const [customAmountText, setCustomAmountText] = useState<string>('1,000');

  // Data bundle state
  const [selectedDataPlan, setSelectedDataPlan] = useState<any>(null);

  // Power state
  const [selectedDisco, setSelectedDisco] = useState<string>('ikedc');
  const [meterType, setMeterType] = useState<'prepaid' | 'postpaid'>('prepaid');
  const [meterNumber, setMeterNumber] = useState<string>('');
  const [meterVerifiedName, setMeterVerifiedName] = useState<string | null>(null);

  // Cable state
  const [selectedCable, setSelectedCable] = useState<string>('dstv');
  const [smartcardNumber, setSmartcardNumber] = useState<string>('');
  const [selectedBouquet, setSelectedBouquet] = useState<any>(null);

  // Dynamic Live Variations (Zero-hardcoding: pulls live operator catalog with server markup)
  const [dynamicDataPlans, setDynamicDataPlans] = useState<DynamicVariation[]>([]);
  const [dynamicBouquets, setDynamicBouquets] = useState<DynamicVariation[]>([]);
  const [isLoadingVariations, setIsLoadingVariations] = useState(false);

  // Modals & confirmation
  const [isConfirmModalVisible, setIsConfirmModalVisible] = useState(false);
  const [isPinModalVisible, setIsPinModalVisible] = useState(false);
  const [enteredPin, setEnteredPin] = useState<string>('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Success Receipt
  const [successReceipt, setSuccessReceipt] = useState<any | null>(null);
  const [hasCopiedToken, setHasCopiedToken] = useState(false);
  const receiptCardRef = useRef<View>(null);
  const [isSharingPdf, setIsSharingPdf] = useState(false);
  const [isSharingImage, setIsSharingImage] = useState(false);

  const handleSharePdf = async () => {
    if (!successReceipt) return;
    try {
      setIsSharingPdf(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await shareReceiptAsPdf({
        reference: successReceipt.reference,
        amount: successReceipt.amount,
        merchant: successReceipt.merchant,
        beneficiary: successReceipt.beneficiary,
        bank: successReceipt.bank,
        date: successReceipt.date,
        token: successReceipt.token,
        units: successReceipt.units,
      });
    } finally {
      setIsSharingPdf(false);
    }
  };

  const handleShareImage = async () => {
    if (!receiptCardRef.current) return;
    try {
      setIsSharingImage(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await shareReceiptAsImage(receiptCardRef);
    } finally {
      setIsSharingImage(false);
    }
  };

  // Auto-detect Telco when phone number changes
  useEffect(() => {
    if (serviceType === 'airtime' || serviceType === 'data') {
      const detected = detectTelcoFromPrefix(recipientNumber);
      if (detected && detected !== selectedTelco) {
        setSelectedTelco(detected);
      }
    }
  }, [recipientNumber, serviceType]);

  // Dynamically fetch live bouquets when cable provider changes
  useEffect(() => {
    let isMounted = true;
    if (serviceType === 'cable') {
      setIsLoadingVariations(true);
      fetchDynamicVariations('cable', selectedCable)
        .then((bouquets) => {
          if (!isMounted) return;
          setDynamicBouquets(bouquets);
          if (bouquets.length > 0) {
            const defaultB = bouquets[1] || bouquets[0];
            const defaultId = defaultB.id || `${defaultB.variation_code}_0`;
            setSelectedBouquet({
              id: defaultId,
              variationCode: defaultB.variation_code,
              name: defaultB.name,
              price: defaultB.price,
              basePrice: defaultB.baseAmount,
            });
          }
        })
        .finally(() => {
          if (isMounted) setIsLoadingVariations(false);
        });
    }
    return () => {
      isMounted = false;
    };
  }, [selectedCable, serviceType]);

  // Dynamically fetch live data bundles when telco changes
  useEffect(() => {
    let isMounted = true;
    if (serviceType === 'data') {
      setIsLoadingVariations(true);
      fetchDynamicVariations('data', selectedTelco)
        .then((plans) => {
          if (!isMounted) return;
          setDynamicDataPlans(plans);
          if (plans.length > 0) {
            const defaultPlan = plans.find((p) => p.name.includes('1.5GB')) || plans[0];
            const defaultIdx = plans.indexOf(defaultPlan);
            const defaultId = defaultPlan.id || `${defaultPlan.variation_code}_${defaultIdx >= 0 ? defaultIdx : 0}`;
            setSelectedDataPlan({
              id: defaultId,
              variationCode: defaultPlan.variation_code,
              name: defaultPlan.name,
              validity: defaultPlan.validity,
              price: defaultPlan.price,
              basePrice: defaultPlan.baseAmount,
            });
          }
        })
        .finally(() => {
          if (isMounted) setIsLoadingVariations(false);
        });
    }
    return () => {
      isMounted = false;
    };
  }, [selectedTelco, serviceType]);

  // Meter lookup simulation
  useEffect(() => {
    if (meterNumber.trim().length >= 10) {
      setMeterVerifiedName('ADEKUNLE OLAITAN (RESIDENTIAL)');
    } else {
      setMeterVerifiedName(null);
    }
  }, [meterNumber]);

  // Smartcard lookup simulation
  useEffect(() => {
    if (smartcardNumber.trim().length >= 10) {
      setMeterVerifiedName('CHUKWUDI EZE (ACTIVE)');
    } else if (serviceType === 'cable') {
      setMeterVerifiedName(null);
    }
  }, [smartcardNumber, serviceType]);

  // Use enrolled user phone number
  const handleUseMyNumber = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (user?.phone) {
      setRecipientNumber(user.phone);
    }
  };

  const handleAmountSelect = (amount: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedAmount(amount);
    setCustomAmountText(amount.toLocaleString());
  };

  const handleCustomAmountChange = (text: string) => {
    const raw = text.replace(/[^0-9]/g, '');
    const num = parseInt(raw, 10);
    if (!isNaN(num)) {
      setSelectedAmount(num);
      setCustomAmountText(num.toLocaleString());
    } else {
      setSelectedAmount(0);
      setCustomAmountText('');
    }
  };

  // Compute payable amount based on service
  const getPayableAmount = () => {
    if (serviceType === 'data') return selectedDataPlan?.price || 1200;
    if (serviceType === 'cable') return selectedBouquet?.price || 5100;
    return selectedAmount;
  };

  // Get active source bank
  const activeAccount = linkedAccounts && linkedAccounts.length > 0
    ? linkedAccounts[selectedBankIndex] || linkedAccounts[0]
    : { id: null, bankName: 'Guaranty Trust Bank', accountNumber: '0123456789', balance: '₦0.00' };

  // Validation
  const validateForm = (): boolean => {
    if (serviceType === 'airtime' || serviceType === 'data') {
      const cleanPhone = recipientNumber.replace(/[^0-9]/g, '');
      if (cleanPhone.length < 10) {
        alert('Please enter a valid 11-digit phone number');
        return false;
      }
    } else if (serviceType === 'power') {
      if (meterNumber.trim().length < 8) {
        alert('Please enter a valid Meter Number');
        return false;
      }
    } else if (serviceType === 'cable') {
      if (smartcardNumber.trim().length < 8) {
        alert('Please enter a valid Smartcard / IUC Number');
        return false;
      }
    }

    const payable = getPayableAmount();
    if (!payable || payable < 50) {
      alert('Minimum payment amount is ₦50');
      return false;
    }

    return true;
  };

  // Open confirmation sheet
  const handleInitiatePayment = () => {
    if (!validateForm()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsConfirmModalVisible(true);
  };

  // Execute payment
  const handleConfirmPayment = async () => {
    const payable = getPayableAmount();
    const threshold = user?.pinThreshold || 10000;

    // Check PIN requirement if amount > user threshold
    if (payable > threshold) {
      setIsConfirmModalVisible(false);
      setEnteredPin('');
      setPinError(null);
      setIsPinModalVisible(true);
      return;
    }

    // Direct execution
    await processFinalPayment();
  };

  const handlePinSubmit = async () => {
    if (enteredPin.length < 4) {
      setPinError('Please enter your 4-digit PIN');
      return;
    }

    setIsPinModalVisible(false);
    await processFinalPayment();
  };

  const processFinalPayment = async () => {
    setIsConfirmModalVisible(false);
    setIsProcessing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const payable = getPayableAmount();
    let provider = selectedTelco;
    let destination = recipientNumber;
    let variationCode: string | undefined = undefined;
    let baseAmount: number | undefined = undefined;

    if (serviceType === 'airtime') {
      provider = selectedTelco;
      destination = recipientNumber;
    } else if (serviceType === 'data') {
      provider = selectedTelco;
      destination = recipientNumber;
      variationCode = (selectedDataPlan as any)?.variationCode || selectedDataPlan?.id;
      baseAmount = (selectedDataPlan as any)?.basePrice;
    } else if (serviceType === 'power') {
      provider = selectedDisco;
      destination = meterNumber;
      variationCode = meterType;
    } else if (serviceType === 'cable') {
      provider = selectedCable;
      destination = smartcardNumber;
      variationCode = (selectedBouquet as any)?.variationCode || selectedBouquet?.id;
      baseAmount = (selectedBouquet as any)?.basePrice;
    } else if (serviceType === 'internet') {
      provider = 'spectranet';
      destination = recipientNumber || '08011111111';
    } else if (serviceType === 'transport') {
      provider = 'cowry';
      destination = 'Cowry: 8940192841';
    } else if (serviceType === 'education') {
      provider = 'waec';
      destination = recipientNumber || 'Candidate PIN';
    }

    try {
      const data = await executeVtuRecharge({
        serviceType: serviceType as any,
        provider,
        amount: payable,
        baseAmount,
        destination,
        customerPhone: user?.phone || recipientNumber || undefined,
        variationCode,
        meterType: serviceType === 'power' ? meterType : undefined,
        accountId: activeAccount?.id || undefined,
        userId: user?.id || undefined,
        pin: enteredPin || undefined,
      });

      if (!data || data.success === false) {
        // PIN required trigger
        if (data?.requirePin) {
          setIsProcessing(false);
          setPinError(data.message || '4-digit PIN required');
          setIsPinModalVisible(true);
          return;
        }

        // Auto-reversal alert if VTPass failed
        if (data?.code === 'FULFILLMENT_FAILED_AUTO_REVERSED') {
          setIsProcessing(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          Alert.alert(
            'Recharge Failed & Auto-Refunded',
            data.message || `The telecom operator could not fulfill this transaction. Your payment of ₦${payable.toLocaleString()} was immediately refunded to your account.`
          );
          if (user?.id) {
            await useBankStore.getState().fetchAccounts(user.id);
          }
          return;
        }

        throw new Error(data?.error || data?.message || 'Transaction could not be completed.');
      }

      // Success flow!
      if (activeAccount?.id) {
        await useBankStore.getState().deductBalance(activeAccount.id, payable);
      }

      const finalRef = data.reference || `MP-BIL-${Date.now()}`;
      const finalTitle = (data.token ? `${data.merchantTitle || 'Quick Service'} [Token: ${data.token}]` : data.merchantTitle) || 'Quick Service';

      // Add to in-memory transaction store
      useTransactionStore.setState((state) => ({
        transactions: [
          {
            id: finalRef,
            reference: finalRef,
            customer_id: user?.customerId || null,
            user_id: user?.id || null,
            merchant_name: finalTitle,
            amount: payable,
            status: 'success',
            account_used: activeAccount?.id || null,
            created_at: data.timestamp || new Date().toISOString(),
            category: 'bills',
            token: data.token || null,
          },
          ...state.transactions,
        ],
      }));

      setIsProcessing(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      setSuccessReceipt({
        reference: data.reference,
        amount: payable,
        merchant: data.merchantTitle,
        beneficiary: destination,
        bank: data.bankName || activeAccount?.bankName || 'MiliPay Linked Account',
        date: new Date(data.timestamp || Date.now()).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }),
        token: data.token || null,
        units: data.units || null,
      });
    } catch (err: any) {
      setIsProcessing(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Payment Failed', err.message || 'An error occurred during payment processing.');
    }
  };

  const copyToClipboard = async (text: string) => {
    await Clipboard.setStringAsync(text);
    Haptics.selectionAsync();
    setHasCopiedToken(true);
    setTimeout(() => setHasCopiedToken(false), 3000);
  };

  const getServiceTitle = () => {
    switch (serviceType) {
      case 'airtime': return 'Buy Airtime';
      case 'data': return 'Buy Data';
      case 'power': return 'Electricity Bill';
      case 'cable': return 'Cable TV';
      case 'internet': return 'Internet Service';
      case 'transport': return 'Transport & Cowry';
      case 'education': return 'Education & Exams';
      default: return 'Quick Service';
    }
  };

  return (
    <SafeAreaView
      className="flex-1 bg-slate-50 dark:bg-black"
      style={{ backgroundColor: isDark ? '#000000' : '#f8fafc' }}
    >
      {/* Top Header */}
      <View className="flex-row items-center justify-between px-4 py-3 bg-white dark:bg-black border-b border-slate-100 dark:border-zinc-800">
        <View className="flex-row items-center">
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={12}
            className="p-1 -ml-1 mr-3"
          >
            <ChevronLeft color={isDark ? '#fff' : '#0f172a'} size={24} />
          </Pressable>
          <Text className="text-slate-900 dark:text-white font-inter-bold text-lg">
            {getServiceTitle()}
          </Text>
        </View>

        {/* Quick Service Category Switcher Tabs */}
        <View className="flex-row items-center bg-slate-100 dark:bg-zinc-800/80 p-1 rounded-full">
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              setServiceType('airtime');
            }}
            className={`px-2.5 py-1 rounded-full ${serviceType === 'airtime' ? 'bg-emerald-500' : ''}`}
          >
            <Smartphone color={serviceType === 'airtime' ? '#000' : (isDark ? '#94a3b8' : '#64748b')} size={14} />
          </Pressable>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              setServiceType('data');
            }}
            className={`px-2.5 py-1 rounded-full ${serviceType === 'data' ? 'bg-emerald-500' : ''}`}
          >
            <Wifi color={serviceType === 'data' ? '#000' : (isDark ? '#94a3b8' : '#64748b')} size={14} />
          </Pressable>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              setServiceType('power');
            }}
            className={`px-2.5 py-1 rounded-full ${serviceType === 'power' ? 'bg-emerald-500' : ''}`}
          >
            <Lightbulb color={serviceType === 'power' ? '#000' : (isDark ? '#94a3b8' : '#64748b')} size={14} />
          </Pressable>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              setServiceType('cable');
            }}
            className={`px-2.5 py-1 rounded-full ${serviceType === 'cable' ? 'bg-emerald-500' : ''}`}
          >
            <Tv color={serviceType === 'cable' ? '#000' : (isDark ? '#94a3b8' : '#64748b')} size={14} />
          </Pressable>
        </View>
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
          {/* Cashback Banner (OPay Standard) */}
          <View className="flex-row items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-4 py-3 mb-5">
            <View className="flex-row items-center flex-1 mr-2">
              <Zap color="#10b981" size={18} className="mr-2" />
              <Text className="text-emerald-700 dark:text-emerald-400 font-inter-semibold text-xs">
                Enjoy zero convenience fees & instant top-up
              </Text>
            </View>
            <View className="bg-emerald-500/20 px-2 py-0.5 rounded">
              <Text className="text-emerald-600 dark:text-emerald-300 font-inter-bold text-[10px]">FREE</Text>
            </View>
          </View>

          {/* 1. AIRTIME & DATA FLOW */}
          {(serviceType === 'airtime' || serviceType === 'data') && (
            <>
              {/* Telco Selector */}
              <View className="bg-white dark:bg-zinc-900 rounded-2xl p-4 mb-4 border border-slate-200 dark:border-zinc-800">
                <Text className="text-slate-500 dark:text-zinc-400 font-inter-semibold text-xs uppercase tracking-wider mb-3">
                  Select Network
                </Text>
                <View className="flex-row justify-between">
                  {TELCOS.map((telco) => {
                    const isSelected = selectedTelco === telco.id;
                    return (
                      <Pressable
                        key={telco.id}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setSelectedTelco(telco.id);
                        }}
                        className={`items-center py-2 px-3 rounded-xl border ${
                          isSelected
                            ? `${telco.border} ${telco.bg}`
                            : 'border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-800/40'
                        } flex-1 mx-1`}
                      >
                        <View className={`w-3 h-3 rounded-full ${telco.badge} mb-1`} />
                        <Text className={`font-inter-bold text-xs ${isSelected ? telco.text : 'text-slate-700 dark:text-zinc-300'}`}>
                          {telco.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Phone Number Input */}
              <View className="bg-white dark:bg-zinc-900 rounded-2xl p-4 mb-4 border border-slate-200 dark:border-zinc-800">
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-slate-500 dark:text-zinc-400 font-inter-semibold text-xs uppercase tracking-wider">
                    Recipient Phone Number
                  </Text>
                  <View className="flex-row items-center">
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setRecipientNumber('08011111111');
                      }}
                      className="bg-amber-500/15 px-2.5 py-1 rounded-full mr-1.5"
                    >
                      <Text className="text-amber-600 dark:text-amber-400 font-inter-bold text-[11px]">
                        Sandbox Test
                      </Text>
                    </Pressable>
                    {user?.phone && (
                      <Pressable
                        onPress={handleUseMyNumber}
                        className="bg-emerald-500/15 px-2.5 py-1 rounded-full flex-row items-center"
                      >
                        <Text className="text-emerald-600 dark:text-emerald-400 font-inter-bold text-[11px]">
                          My Number
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>

                <View className="flex-row items-center h-14 px-4 rounded-xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700">
                  <Smartphone color={isDark ? '#71717a' : '#94a3b8'} size={20} className="mr-2" />
                  <TextInput
                    value={recipientNumber}
                    onChangeText={setRecipientNumber}
                    placeholder="0801 234 5678"
                    placeholderTextColor={isDark ? '#52525b' : '#94a3b8'}
                    keyboardType="phone-pad"
                    className="flex-1 text-slate-900 dark:text-white font-inter-bold text-base"
                  />
                </View>
              </View>

              {/* AIRTIME: Amount Presets & Custom Input */}
              {serviceType === 'airtime' && (
                <View className="bg-white dark:bg-zinc-900 rounded-2xl p-4 mb-4 border border-slate-200 dark:border-zinc-800">
                  <Text className="text-slate-500 dark:text-zinc-400 font-inter-semibold text-xs uppercase tracking-wider mb-3">
                    Recharge Amount
                  </Text>

                  {/* Preset Chips */}
                  <View className="flex-row flex-wrap justify-between mb-4">
                    {AIRTIME_PRESETS.map((amt) => {
                      const isSelected = selectedAmount === amt;
                      return (
                        <Pressable
                          key={amt}
                          onPress={() => handleAmountSelect(amt)}
                          className={`w-[31%] py-3.5 mb-2.5 rounded-2xl items-center justify-center border ${
                            isSelected
                              ? 'bg-emerald-500 border-emerald-500'
                              : 'bg-slate-50 dark:bg-zinc-800 border-slate-200 dark:border-zinc-700'
                          }`}
                        >
                          <Text
                            className={`text-sm ${
                              isSelected
                                ? 'text-black font-inter-bold'
                                : 'text-slate-800 dark:text-zinc-200 font-inter-semibold'
                            }`}
                          >
                            ₦{amt.toLocaleString()}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {/* Custom Amount Field */}
                  <View className="flex-row items-center h-14 px-4 rounded-2xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700">
                    <Text className="text-slate-500 dark:text-zinc-400 font-inter-bold text-base mr-2">
                      ₦
                    </Text>
                    <TextInput
                      value={customAmountText}
                      onChangeText={handleCustomAmountChange}
                      placeholder="Custom Amount (₦50 - ₦50,000)"
                      placeholderTextColor={isDark ? '#71717a' : '#94a3b8'}
                      keyboardType="number-pad"
                      className="flex-1 text-slate-900 dark:text-white font-inter-bold text-base"
                    />
                  </View>
                </View>
              )}

              {/* DATA: Bundle Picker (Dynamically pulled live from VTPass) */}
              {serviceType === 'data' && (
                <View className="bg-white dark:bg-zinc-900 rounded-2xl p-4 mb-4 border border-slate-200 dark:border-zinc-800">
                  <View className="flex-row items-center justify-between mb-3">
                    <Text className="text-slate-500 dark:text-zinc-400 font-inter-semibold text-xs uppercase tracking-wider">
                      Select Data Plan ({selectedTelco.toUpperCase()})
                    </Text>
                    <View className="bg-emerald-500/10 px-2 py-0.5 rounded-full">
                      <Text className="text-emerald-600 dark:text-emerald-400 font-inter-bold text-[10px]">
                        Live Rates
                      </Text>
                    </View>
                  </View>

                  {isLoadingVariations ? (
                    <View className="py-8 items-center justify-center">
                      <ActivityIndicator color="#10b981" size="small" />
                      <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs mt-2">
                        Pulling real-time {selectedTelco.toUpperCase()} data plans...
                      </Text>
                    </View>
                  ) : (
                    <View className="space-y-2.5">
                      {dynamicDataPlans.map((bundle, idx) => {
                        const planKey = bundle.id || `${bundle.variation_code}_${bundle.baseAmount}_${idx}`;
                        const isSelected = selectedDataPlan?.id === planKey;
                        return (
                          <Pressable
                            key={planKey}
                            onPress={() => {
                              Haptics.selectionAsync();
                              setSelectedDataPlan({
                                id: planKey,
                                variationCode: bundle.variation_code,
                                name: bundle.name,
                                validity: bundle.validity,
                                price: bundle.price,
                                basePrice: bundle.baseAmount,
                              });
                            }}
                            className={`flex-row items-center justify-between p-4 rounded-2xl border mb-2.5 ${
                              isSelected
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-2 border-emerald-500'
                                : 'bg-slate-50 dark:bg-zinc-800 border-slate-200 dark:border-zinc-700'
                            }`}
                          >
                            <View className="flex-1 mr-2">
                              <Text className="text-slate-900 dark:text-white font-inter-bold text-sm">
                                {bundle.name}
                              </Text>
                              <View className="flex-row items-center mt-1">
                                <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs mr-2">
                                  {bundle.validity}
                                </Text>
                                <View className="bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                  <Text className="text-emerald-600 dark:text-emerald-400 font-inter-bold text-[9px]">
                                    Instant
                                  </Text>
                                </View>
                              </View>
                            </View>
                            <View className="flex-row items-center">
                              <Text className="text-emerald-600 dark:text-emerald-400 font-inter-bold text-sm mr-2">
                                ₦{bundle.price.toLocaleString()}
                              </Text>
                              {isSelected && <Check color="#10b981" size={18} strokeWidth={2.5} />}
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}
            </>
          )}

          {/* 2. ELECTRICITY FLOW */}
          {serviceType === 'power' && (
            <>
              {/* Disco Selection */}
              <View className="bg-white dark:bg-zinc-900 rounded-2xl p-4 mb-4 border border-slate-200 dark:border-zinc-800">
                <Text className="text-slate-500 dark:text-zinc-400 font-inter-semibold text-xs uppercase tracking-wider mb-3">
                  Electricity Distribution Company
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1">
                  {DISCOS.map((disco) => {
                    const isSelected = selectedDisco === disco.id;
                    return (
                      <Pressable
                        key={disco.id}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setSelectedDisco(disco.id);
                        }}
                        className={`px-4 py-2.5 rounded-xl border mr-2 ${
                          isSelected
                            ? 'bg-emerald-500 border-emerald-500'
                            : 'bg-slate-50 dark:bg-zinc-800/50 border-slate-200 dark:border-zinc-700'
                        }`}
                      >
                        <Text className={`text-xs ${isSelected ? 'text-black font-inter-bold' : 'text-slate-700 dark:text-zinc-300 font-inter-medium'}`}>
                          {disco.short}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Meter Type (Prepaid vs Postpaid) */}
              <View className="bg-white dark:bg-zinc-900 rounded-2xl p-4 mb-4 border border-slate-200 dark:border-zinc-800">
                <Text className="text-slate-500 dark:text-zinc-400 font-inter-semibold text-xs uppercase tracking-wider mb-3">
                  Meter Type
                </Text>
                <View className="flex-row bg-slate-100 dark:bg-zinc-800 p-1 rounded-xl">
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync();
                      setMeterType('prepaid');
                    }}
                    className={`flex-1 py-2.5 rounded-lg items-center ${
                      meterType === 'prepaid' ? 'bg-emerald-500' : ''
                    }`}
                  >
                    <Text className={`font-inter-bold text-xs ${meterType === 'prepaid' ? 'text-black' : 'text-slate-600 dark:text-zinc-400'}`}>
                      Prepaid (Token)
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync();
                      setMeterType('postpaid');
                    }}
                    className={`flex-1 py-2.5 rounded-lg items-center ${
                      meterType === 'postpaid' ? 'bg-emerald-500' : ''
                    }`}
                  >
                    <Text className={`font-inter-bold text-xs ${meterType === 'postpaid' ? 'text-black' : 'text-slate-600 dark:text-zinc-400'}`}>
                      Postpaid (Bill)
                    </Text>
                  </Pressable>
                </View>
              </View>

              {/* Meter Number & Account Verification */}
              <View className="bg-white dark:bg-zinc-900 rounded-2xl p-4 mb-4 border border-slate-200 dark:border-zinc-800">
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-slate-500 dark:text-zinc-400 font-inter-semibold text-xs uppercase tracking-wider">
                    Meter Number
                  </Text>
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setMeterNumber(meterType === 'postpaid' ? '1010101010101' : '1111111111111');
                    }}
                    className="bg-amber-500/15 px-2.5 py-1 rounded-full"
                  >
                    <Text className="text-amber-600 dark:text-amber-400 font-inter-bold text-[11px]">
                      Sandbox Test
                    </Text>
                  </Pressable>
                </View>
                <View className="flex-row items-center h-14 px-4 rounded-xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700 mb-2">
                  <Lightbulb color={isDark ? '#71717a' : '#94a3b8'} size={20} className="mr-2" />
                  <TextInput
                    value={meterNumber}
                    onChangeText={setMeterNumber}
                    placeholder="e.g. 45019283741"
                    placeholderTextColor={isDark ? '#52525b' : '#94a3b8'}
                    keyboardType="number-pad"
                    className="flex-1 text-slate-900 dark:text-white font-inter-bold text-base"
                  />
                </View>

                {meterVerifiedName && (
                  <View className="flex-row items-center bg-emerald-500/10 px-3 py-2 rounded-lg border border-emerald-500/20 mt-1">
                    <ShieldCheck color="#10b981" size={14} className="mr-1.5" />
                    <Text className="text-emerald-700 dark:text-emerald-400 font-inter-semibold text-xs flex-1">
                      {meterVerifiedName}
                    </Text>
                  </View>
                )}
              </View>

              {/* Electricity Amount Presets */}
              <View className="bg-white dark:bg-zinc-900 rounded-2xl p-4 mb-4 border border-slate-200 dark:border-zinc-800">
                <Text className="text-slate-500 dark:text-zinc-400 font-inter-semibold text-xs uppercase tracking-wider mb-3">
                  Amount
                </Text>
                <View className="flex-row flex-wrap justify-between mb-4">
                  {POWER_PRESETS.map((amt) => {
                    const isSelected = selectedAmount === amt;
                    return (
                      <Pressable
                        key={amt}
                        onPress={() => handleAmountSelect(amt)}
                        className={`w-[31%] py-3.5 mb-2.5 rounded-2xl items-center justify-center border ${
                          isSelected
                            ? 'bg-emerald-500 border-emerald-500'
                            : 'bg-slate-50 dark:bg-zinc-800 border-slate-200 dark:border-zinc-700'
                        }`}
                      >
                        <Text
                          className={`text-sm ${
                            isSelected
                              ? 'text-black font-inter-bold'
                              : 'text-slate-800 dark:text-zinc-200 font-inter-semibold'
                          }`}
                        >
                          ₦{amt.toLocaleString()}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Custom Amount */}
                <View className="flex-row items-center h-14 px-4 rounded-2xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700">
                  <Text className="text-slate-500 dark:text-zinc-400 font-inter-bold text-base mr-2">
                    ₦
                  </Text>
                  <TextInput
                    value={customAmountText}
                    onChangeText={handleCustomAmountChange}
                    placeholder="Enter Amount"
                    placeholderTextColor={isDark ? '#71717a' : '#94a3b8'}
                    keyboardType="number-pad"
                    className="flex-1 text-slate-900 dark:text-white font-inter-bold text-base"
                  />
                </View>
              </View>
            </>
          )}

          {/* 3. CABLE TV FLOW */}
          {serviceType === 'cable' && (
            <>
              {/* Provider Selection */}
              <View className="bg-white dark:bg-zinc-900 rounded-2xl p-4 mb-4 border border-slate-200 dark:border-zinc-800">
                <Text className="text-slate-500 dark:text-zinc-400 font-inter-semibold text-xs uppercase tracking-wider mb-3">
                  Cable TV Provider
                </Text>
                <View className="flex-row gap-2">
                  {CABLE_PROVIDERS.map((prov) => {
                    const isSelected = selectedCable === prov.id;
                    return (
                      <Pressable
                        key={prov.id}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setSelectedCable(prov.id);
                        }}
                        className={`flex-1 py-3 rounded-xl border items-center justify-center ${
                          isSelected
                            ? 'bg-emerald-500 border-emerald-500'
                            : 'bg-slate-50 dark:bg-zinc-800/50 border-slate-200 dark:border-zinc-700'
                        }`}
                      >
                        <Text className={`font-inter-bold text-xs ${isSelected ? 'text-black' : 'text-slate-800 dark:text-zinc-200'}`}>
                          {prov.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Smartcard Number Input */}
              <View className="bg-white dark:bg-zinc-900 rounded-2xl p-4 mb-4 border border-slate-200 dark:border-zinc-800">
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-slate-500 dark:text-zinc-400 font-inter-semibold text-xs uppercase tracking-wider">
                    Smartcard / IUC Number
                  </Text>
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSmartcardNumber('1212121212');
                    }}
                    className="bg-amber-500/15 px-2.5 py-1 rounded-full"
                  >
                    <Text className="text-amber-600 dark:text-amber-400 font-inter-bold text-[11px]">
                      Sandbox Test
                    </Text>
                  </Pressable>
                </View>
                <View className="flex-row items-center h-14 px-4 rounded-xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700 mb-2">
                  <Tv color={isDark ? '#71717a' : '#94a3b8'} size={20} className="mr-2" />
                  <TextInput
                    value={smartcardNumber}
                    onChangeText={setSmartcardNumber}
                    placeholder="e.g. 1029384756"
                    placeholderTextColor={isDark ? '#52525b' : '#94a3b8'}
                    keyboardType="number-pad"
                    className="flex-1 text-slate-900 dark:text-white font-inter-bold text-base"
                  />
                </View>

                {meterVerifiedName && (
                  <View className="flex-row items-center bg-emerald-500/10 px-3 py-2 rounded-lg border border-emerald-500/20 mt-1">
                    <ShieldCheck color="#10b981" size={14} className="mr-1.5" />
                    <Text className="text-emerald-700 dark:text-emerald-400 font-inter-semibold text-xs flex-1">
                      {meterVerifiedName}
                    </Text>
                  </View>
                )}
              </View>

              {/* Bouquet / Package List (Dynamically pulled live from VTPass) */}
              <View className="bg-white dark:bg-zinc-900 rounded-2xl p-4 mb-4 border border-slate-200 dark:border-zinc-800">
                <View className="flex-row items-center justify-between mb-3">
                  <Text className="text-slate-500 dark:text-zinc-400 font-inter-semibold text-xs uppercase tracking-wider">
                    Select Package ({selectedCable.toUpperCase()})
                  </Text>
                  <View className="bg-emerald-500/10 px-2 py-0.5 rounded-full">
                    <Text className="text-emerald-600 dark:text-emerald-400 font-inter-bold text-[10px]">
                      Live Pricing
                    </Text>
                  </View>
                </View>

                {isLoadingVariations ? (
                  <View className="py-8 items-center justify-center">
                    <ActivityIndicator color="#10b981" size="small" />
                    <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs mt-2">
                      Pulling real-time {selectedCable.toUpperCase()} bouquets...
                    </Text>
                  </View>
                ) : (
                  <View className="space-y-2">
                    {dynamicBouquets.map((b, idx) => {
                      const bouquetKey = b.id || `${b.variation_code}_${b.baseAmount}_${idx}`;
                      const isSelected = selectedBouquet?.id === bouquetKey;
                      return (
                        <Pressable
                          key={bouquetKey}
                          onPress={() => {
                            Haptics.selectionAsync();
                            setSelectedBouquet({
                              id: bouquetKey,
                              variationCode: b.variation_code,
                              name: b.name,
                              price: b.price,
                              basePrice: b.baseAmount,
                            });
                          }}
                          className={`flex-row items-center justify-between p-4 rounded-2xl border mb-2.5 ${
                            isSelected
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-2 border-emerald-500'
                              : 'bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700'
                          }`}
                        >
                          <View className="flex-1 mr-2">
                            <Text className="text-slate-900 dark:text-white font-inter-bold text-sm">
                              {b.name}
                            </Text>
                            <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs mt-0.5">
                              {b.validity || 'Monthly Subscription'}
                            </Text>
                          </View>
                          <View className="flex-row items-center">
                            <Text className="text-emerald-600 dark:text-emerald-400 font-inter-bold text-sm mr-2">
                              ₦{b.price.toLocaleString()}
                            </Text>
                            {isSelected && <Check color="#10b981" size={18} strokeWidth={2.5} />}
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            </>
          )}

          {/* Payment Source Card */}
          <View className="bg-white dark:bg-zinc-900 rounded-2xl p-4 mb-6 border border-slate-200 dark:border-zinc-800">
            <View className="flex-row items-center justify-between mb-2.5">
              <Text className="text-slate-500 dark:text-zinc-400 font-inter-semibold text-xs uppercase tracking-wider">
                Payment Account
              </Text>
              <View className="bg-emerald-500/15 px-2 py-0.5 rounded-full">
                <Text className="text-emerald-600 dark:text-emerald-400 font-inter-bold text-[10px]">
                  Mono DirectPay
                </Text>
              </View>
            </View>

            {linkedAccounts.length > 1 ? (
              <View className="gap-2">
                {linkedAccounts.map((acc, idx) => {
                  const isChosen = idx === selectedBankIndex;
                  return (
                    <Pressable
                      key={acc.id}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setSelectedBankIndex(idx);
                        setActiveBankIndex(idx);
                      }}
                      className={`p-3 rounded-xl border flex-row items-center justify-between ${
                        isChosen
                          ? 'border-emerald-500 bg-emerald-500/10 dark:bg-emerald-500/15'
                          : 'border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-800/40 active:bg-slate-100'
                      }`}
                    >
                      <View className="flex-row items-center flex-1 mr-2">
                        <View
                          className={`w-9 h-9 rounded-full items-center justify-center mr-3 ${
                            isChosen ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-zinc-700'
                          }`}
                        >
                          <CreditCard color={isChosen ? '#000' : '#94a3b8'} size={18} />
                        </View>
                        <View className="flex-1">
                          <Text
                            className={`font-inter-bold text-sm ${
                              isChosen ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white'
                            }`}
                          >
                            {acc.bankName}
                          </Text>
                          <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs">
                            •••• {acc.accountNumber.slice(-4)} • Balance: {acc.balance}
                          </Text>
                        </View>
                      </View>
                      <View
                        className={`w-5 h-5 rounded-full border items-center justify-center ${
                          isChosen ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300 dark:border-zinc-600'
                        }`}
                      >
                        {isChosen && <Check color="#000" size={12} strokeWidth={3} />}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <View className="w-10 h-10 rounded-full bg-emerald-500/15 items-center justify-center mr-3">
                    <CreditCard color="#10b981" size={20} />
                  </View>
                  <View>
                    <Text className="text-slate-900 dark:text-white font-inter-bold text-sm">
                      {activeAccount.bankName}
                    </Text>
                    <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs">
                      •••• {activeAccount.accountNumber.slice(-4)} • Balance: {activeAccount.balance}
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </View>

          {/* Pay Action Button */}
          <Pressable
            onPress={handleInitiatePayment}
            disabled={isProcessing}
            className="h-14 rounded-2xl bg-emerald-500 active:bg-emerald-600 items-center justify-center mb-10"
            style={{
              shadowColor: '#10b981',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 10,
              elevation: 4,
            }}
          >
            {isProcessing ? (
              <ActivityIndicator color="#000" size="small" />
            ) : (
              <Text className="text-black font-inter-bold text-base">
                Pay ₦{getPayableAmount().toLocaleString()}
              </Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Confirmation Bottom Sheet Modal */}
      <Modal
        visible={isConfirmModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsConfirmModalVisible(false)}
      >
        <View className="flex-1 justify-end bg-black/60">
          <Pressable
            className="flex-1"
            onPress={() => setIsConfirmModalVisible(false)}
          />
          <View className="bg-white dark:bg-zinc-900 rounded-t-3xl p-6 border-t border-slate-200 dark:border-zinc-800">
            <View className="w-12 h-1.5 bg-slate-300 dark:bg-zinc-700 rounded-full self-center mb-5" />

            <Text className="text-slate-900 dark:text-white font-inter-bold text-xl text-center mb-1">
              Confirm Payment
            </Text>
            <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs text-center mb-6">
              Review your transaction details before proceeding.
            </Text>

            {/* Total Amount Big Banner */}
            <View className="items-center justify-center py-4 bg-slate-50 dark:bg-zinc-800/60 rounded-2xl mb-5 border border-slate-200/80 dark:border-zinc-700/60">
              <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs mb-1">Total Payable</Text>
              <Text className="text-slate-900 dark:text-white font-inter-bold text-3xl">
                ₦{getPayableAmount().toLocaleString()}
              </Text>
            </View>

            {/* Breakdown rows */}
            <View className="space-y-3 mb-6 px-1">
              <View className="flex-row justify-between mb-2">
                <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs">Service</Text>
                <Text className="text-slate-900 dark:text-white font-inter-semibold text-xs">
                  {getServiceTitle()}
                </Text>
              </View>
              <View className="flex-row justify-between mb-2">
                <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs">Beneficiary</Text>
                <Text className="text-slate-900 dark:text-white font-inter-semibold text-xs">
                  {serviceType === 'power' ? meterNumber : serviceType === 'cable' ? smartcardNumber : recipientNumber}
                </Text>
              </View>
              <View className="flex-row justify-between mb-2">
                <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs">Payment Method</Text>
                <Text className="text-slate-900 dark:text-white font-inter-semibold text-xs">
                  {activeAccount.bankName} (****{activeAccount.accountNumber.slice(-4)})
                </Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs">Transaction Fee</Text>
                <Text className="text-emerald-600 dark:text-emerald-400 font-inter-bold text-xs">
                  ₦0.00 (FREE)
                </Text>
              </View>
            </View>

            {/* Confirm & Pay CTA */}
            <Pressable
              onPress={handleConfirmPayment}
              className="h-14 rounded-2xl bg-emerald-500 active:bg-emerald-600 items-center justify-center"
              style={{
                shadowColor: '#10b981',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.25,
                shadowRadius: 8,
                elevation: 4,
              }}
            >
              <Text className="text-black font-inter-bold text-base">
                Confirm & Pay
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* PIN Challenge Modal (For High-Value Payments > pinThreshold) */}
      <Modal
        visible={isPinModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsPinModalVisible(false)}
      >
        <View className="flex-1 justify-center items-center px-6 bg-black/60">
          <Pressable
            className="absolute inset-0"
            onPress={() => setIsPinModalVisible(false)}
          />
          <View className="w-full max-w-sm rounded-3xl p-6 bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 items-center">
            <View className="w-14 h-14 rounded-full bg-emerald-500/15 items-center justify-center mb-4">
              <Lock color="#10b981" size={24} />
            </View>

            <Text className="text-slate-900 dark:text-white font-inter-bold text-lg text-center mb-1">
              Enter 4-Digit MiliPay PIN
            </Text>
            <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs text-center mb-5 px-2">
              This transaction of ₦{getPayableAmount().toLocaleString()} exceeds your instant threshold (₦{(user?.pinThreshold || 10000).toLocaleString()}).
            </Text>

            {/* PIN Input */}
            <TextInput
              value={enteredPin}
              onChangeText={(t) => {
                setEnteredPin(t.slice(0, 4));
                setPinError(null);
              }}
              keyboardType="number-pad"
              maxLength={4}
              secureTextEntry
              autoFocus
              placeholder="••••"
              placeholderTextColor={isDark ? '#52525b' : '#94a3b8'}
              className="w-40 h-14 bg-slate-100 dark:bg-zinc-800 rounded-2xl text-center text-slate-900 dark:text-white font-inter-bold text-2xl tracking-[12px] mb-2"
            />

            {pinError && (
              <Text className="text-red-500 font-inter text-xs mb-3">{pinError}</Text>
            )}

            <Pressable
              onPress={handlePinSubmit}
              disabled={enteredPin.length < 4}
              className={`w-full h-13 rounded-xl items-center justify-center mt-3 ${
                enteredPin.length === 4 ? 'bg-emerald-500 active:bg-emerald-600' : 'bg-slate-200 dark:bg-zinc-800 opacity-60'
              }`}
            >
              <Text className="text-black font-inter-bold text-base">Authorize Payment</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Success Receipt Modal (OPay Standard) */}
      <Modal
        visible={!!successReceipt}
        transparent
        animationType="fade"
        onRequestClose={() => setSuccessReceipt(null)}
      >
        <View className="flex-1 justify-center items-center px-4 bg-black/70">
          <View
            className="w-full max-w-sm max-h-[92%] rounded-3xl bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 overflow-hidden"
            style={{
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 12 },
              shadowOpacity: 0.35,
              shadowRadius: 24,
              elevation: 14,
            }}
          >
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 20, alignItems: 'center' }}
            >
              {/* Printable / Snapshot Receipt Card */}
              <View
                ref={receiptCardRef}
                collapsable={false}
                className="w-full items-center bg-white dark:bg-zinc-900 p-1 rounded-2xl"
              >
                {/* Big Green Badge */}
                <View className="w-22 h-22 rounded-full bg-emerald-500/15 items-center justify-center mb-3">
                  <View
                    className="w-16 h-16 rounded-full bg-emerald-500 items-center justify-center"
                    style={{
                      shadowColor: '#10b981',
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.35,
                      shadowRadius: 10,
                      elevation: 8,
                    }}
                  >
                    <Check color="#000" size={32} strokeWidth={3.5} />
                  </View>
                </View>

                {/* Enlarged Title & Amount */}
                <Text className="text-slate-900 dark:text-white font-inter-black text-2xl text-center mb-1 tracking-tight">
                  Payment Successful!
                </Text>
                <Text className="text-emerald-600 dark:text-emerald-400 font-inter-black text-3xl mb-4">
                  ₦{successReceipt?.amount?.toLocaleString()}
                </Text>

                {/* PREPAID ELECTRICITY TOKEN CARD (Special Feature) */}
                {successReceipt?.token && (
                  <View className="w-full bg-emerald-500/10 border-2 border-dashed border-emerald-500/40 rounded-2xl p-4 mb-4 items-center">
                    <Text className="text-emerald-800 dark:text-emerald-300 font-inter-semibold text-xs mb-1 uppercase tracking-wider">
                      20-Digit Recharge Token
                    </Text>
                    <Text className="text-slate-900 dark:text-white font-inter-bold text-lg tracking-wider mb-2 text-center select-all">
                      {successReceipt.token}
                    </Text>
                    {successReceipt.units && (
                      <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs mb-3">
                        Units Credited: {successReceipt.units}
                      </Text>
                    )}
                    <Pressable
                      onPress={() => copyToClipboard(successReceipt.token)}
                      className="flex-row items-center bg-emerald-500 px-4 py-2 rounded-xl active:bg-emerald-600"
                    >
                      {hasCopiedToken ? (
                        <>
                          <CheckCheck color="#000" size={14} className="mr-1.5" />
                          <Text className="text-black font-inter-bold text-xs">Copied!</Text>
                        </>
                      ) : (
                        <>
                          <Copy color="#000" size={14} className="mr-1.5" />
                          <Text className="text-black font-inter-bold text-xs">Copy Token</Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                )}

                {/* Receipt Summary Card */}
                <View className="w-full rounded-2xl bg-slate-50 dark:bg-zinc-800/60 p-4 border border-slate-200/80 dark:border-zinc-700/60 mb-2">
                  <View className="flex-row justify-between mb-2.5">
                    <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs">Service</Text>
                    <Text className="text-slate-900 dark:text-white font-inter-semibold text-xs text-right flex-1 ml-2">
                      {successReceipt?.merchant}
                    </Text>
                  </View>
                  <View className="flex-row justify-between mb-2.5">
                    <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs">Beneficiary</Text>
                    <Text className="text-slate-900 dark:text-white font-inter-semibold text-xs text-right flex-1 ml-2">
                      {successReceipt?.beneficiary}
                    </Text>
                  </View>
                  <View className="flex-row justify-between mb-2.5">
                    <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs">Reference</Text>
                    <Text className="text-slate-900 dark:text-white font-inter-semibold text-xs text-right flex-1 ml-2">
                      {successReceipt?.reference}
                    </Text>
                  </View>
                  <View className="flex-row justify-between mb-2.5">
                    <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs">Payment Method</Text>
                    <Text className="text-slate-900 dark:text-white font-inter-semibold text-xs text-right flex-1 ml-2">
                      {successReceipt?.bank}
                    </Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs">Date & Time</Text>
                    <Text className="text-slate-900 dark:text-white font-inter-semibold text-xs text-right flex-1 ml-2">
                      {successReceipt?.date}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Share Actions (Picture & PDF) */}
              <View className="w-full flex-row gap-2.5 mt-2 mb-3">
                <Pressable
                  onPress={handleSharePdf}
                  disabled={isSharingPdf}
                  className="flex-1 h-12 rounded-xl bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 flex-row items-center justify-center active:bg-slate-200 dark:active:bg-zinc-700"
                >
                  {isSharingPdf ? (
                    <ActivityIndicator color="#10b981" size="small" />
                  ) : (
                    <>
                      <FileText color="#10b981" size={16} className="mr-1.5" />
                      <Text className="text-slate-800 dark:text-zinc-200 font-inter-bold text-xs">Share PDF</Text>
                    </>
                  )}
                </Pressable>

                <Pressable
                  onPress={handleShareImage}
                  disabled={isSharingImage}
                  className="flex-1 h-12 rounded-xl bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 flex-row items-center justify-center active:bg-slate-200 dark:active:bg-zinc-700"
                >
                  {isSharingImage ? (
                    <ActivityIndicator color="#10b981" size="small" />
                  ) : (
                    <>
                      <Share2 color="#10b981" size={16} className="mr-1.5" />
                      <Text className="text-slate-800 dark:text-zinc-200 font-inter-bold text-xs">Share Picture</Text>
                    </>
                  )}
                </Pressable>
              </View>

              {/* Enlarged Done Button */}
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSuccessReceipt(null);
                  if (navigation?.goBack) {
                    navigation.goBack();
                  }
                }}
                className="w-full h-15 rounded-2xl bg-emerald-500 active:bg-emerald-600 items-center justify-center shadow-md shadow-emerald-500/20"
              >
                <Text className="text-black font-inter-bold text-lg tracking-wide">Done</Text>
              </Pressable>

              {/* Secondary Action */}
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSuccessReceipt(null);
                  if (navigation?.navigate) {
                    navigation.navigate('Transactions');
                  }
                }}
                className="w-full h-11 rounded-xl items-center justify-center bg-slate-100 dark:bg-zinc-800/80 active:bg-slate-200 dark:active:bg-zinc-700 mt-2.5"
              >
                <Text className="text-slate-700 dark:text-zinc-300 font-inter-semibold text-xs">
                  View in Transactions
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
