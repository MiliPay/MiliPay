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
  AlertTriangle,
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
import { colors } from '../../theme/tokens';
import { shareReceiptAsPdf, shareReceiptAsImage } from '../../lib/receiptSharing';
import { supabase } from '../../lib/supabase';
import {
  fetchDynamicVariations,
  fetchSmeDataPlans,
  executeVtuRecharge,
  verifyBillAccount,
  DynamicVariation,
} from '../../lib/vtuService';
import { ConfirmIdentitySheet } from '../../components/ui/ConfirmIdentitySheet';
import { PurchaseProgressSheet } from '../../components/ui/PurchaseProgressSheet';
import {
  watchTransaction,
  isSuccess,
  type TransactionSnapshot,
} from '../../lib/transactionStatus';

// Telco Configuration
const TELCOS = [
  { id: 'mtn', name: 'MTN', color: '#eab308', bg: 'bg-yellow-500/15', border: 'border-yellow-500', text: 'text-yellow-600 dark:text-yellow-400', badge: 'bg-yellow-500' },
  { id: 'airtel', name: 'Airtel', color: '#ef4444', bg: 'bg-red-500/15', border: 'border-red-500', text: 'text-red-600 dark:text-red-400', badge: 'bg-red-500' },
  { id: 'glo', name: 'Glo', color: '#22c55e', bg: 'bg-signal/15', border: 'border-signal', text: 'text-signal-dim dark:text-signal-bright', badge: 'bg-signal' },
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

// Cable providers. Packages themselves are fetched live, never hardcoded.
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

/** A catalogue that came back with nothing in it, said out loud. */
const CatalogueEmpty = ({ title, body }: { title: string; body: string }) => (
  <View className="py-7 px-4 items-center">
    <View className="w-10 h-10 rounded-full bg-black/[0.04] dark:bg-white/[0.06] items-center justify-center mb-3">
      <AlertTriangle color={colors.ink.faint} size={18} />
    </View>
    <Text className="text-slate-700 dark:text-white/80 font-inter-semibold text-sm text-center">
      {title}
    </Text>
    <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs text-center mt-1 leading-[17px]">
      {body}
    </Text>
  </View>
);

/**
 * Who the provider says owns this meter or smartcard.
 *
 * The name is only ever shown when a provider returned it. Two effects used to
 * set it to a hardcoded string as soon as the field held ten digits, so a
 * customer saw a plausible name confirm a number nobody had checked.
 */
const AccountHolderBadge = ({
  isVerifying,
  name,
  address,
  error,
}: {
  isVerifying: boolean;
  name: string | null;
  address: string | null;
  error: string | null;
}) => {
  if (isVerifying) {
    return (
      <View className="flex-row items-center px-3 py-2 rounded-lg bg-black/[0.03] dark:bg-white/[0.05] mt-1">
        <ActivityIndicator size="small" color={colors.ink.faint} />
        <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs ml-2">
          Checking this account…
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-row items-center bg-status-fail/10 px-3 py-2 rounded-lg border border-status-fail/25 mt-1">
        <AlertTriangle color={colors.status.fail} size={14} />
        <Text className="text-status-fail font-inter-medium text-xs flex-1 ml-1.5">{error}</Text>
      </View>
    );
  }

  if (!name) return null;

  return (
    <View className="bg-signal/10 px-3 py-2 rounded-lg border border-signal/25 mt-1">
      <View className="flex-row items-center">
        <ShieldCheck color={colors.signal.base} size={14} />
        <Text className="text-signal-dim dark:text-signal-bright font-inter-semibold text-xs flex-1 ml-1.5">
          {name}
        </Text>
      </View>
      {address ? (
        <Text className="text-slate-500 dark:text-zinc-400 font-inter text-[11px] mt-0.5 ml-[22px]">
          {address}
        </Text>
      ) : null}
    </View>
  );
};

export default function QuickServiceScreen({ route, navigation }: any) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme !== 'light';

  const user = useAuthStore((state) => state.user);
  const { linkedAccounts, activeBankIndex, setActiveBankIndex } = useBankStore();
  const [selectedBankIndex, setSelectedBankIndex] = useState<number>(activeBankIndex || 0);

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
  const [dataCategory, setDataCategory] = useState<'sme' | 'direct'>('sme');

  // Power state
  const [selectedDisco, setSelectedDisco] = useState<string>('ikedc');
  const [meterType, setMeterType] = useState<'prepaid' | 'postpaid'>('prepaid');
  const [meterNumber, setMeterNumber] = useState<string>('');

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

  // Step 4: fingerprint, PIN as fallback. Above the customer's PIN threshold
  // the PIN stops being a fallback and becomes mandatory, because the server
  // verifies it and cannot verify a fingerprint the phone checked.
  const [isIdentitySheetVisible, setIsIdentitySheetVisible] = useState(false);

  // Step 5: what they watch while the bank and the network do their part.
  const [progressSnapshot, setProgressSnapshot] = useState<TransactionSnapshot | null>(null);
  const [isProgressVisible, setIsProgressVisible] = useState(false);
  const [progressTitle, setProgressTitle] = useState('');
  const stopWatchingRef = useRef<(() => void) | null>(null);

  // Electricity and cable cannot be paid without the verified account holder;
  // BigiSub's own endpoints require it.
  const [verifiedName, setVerifiedName] = useState<string | null>(null);
  const [verifiedAddress, setVerifiedAddress] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [isAutoVerifying, setIsAutoVerifying] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    // A verified name belongs to one specific meter or smartcard. Changing the
    // number must invalidate it, or the purchase would carry the previous
    // holder's name against the new account.
    setVerifiedName(null);
    setVerifiedAddress(null);
  }, [meterNumber, smartcardNumber, selectedDisco, selectedCable, meterType, serviceType]);

  // Success Receipt
  const [successReceipt, setSuccessReceipt] = useState<any | null>(null);
  const [hasCopiedToken, setHasCopiedToken] = useState(false);
  const receiptCardRef = useRef<View>(null);

  useEffect(() => {
    return () => {
      stopWatchingRef.current?.();
      stopWatchingRef.current = null;
    };
  }, []);
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
        status: successReceipt.status ?? 'delivered',
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

      // Clear the previous provider's package first, for the same reason as
      // the data catalogue below: an empty result left the old provider's
      // selection live behind a blank list.
      setDynamicBouquets([]);
      setSelectedBouquet(null);

      fetchDynamicVariations('cable', selectedCable)
        .then((bouquets) => {
          if (!isMounted) return;
          setDynamicBouquets(bouquets);
          // No package is pre-selected. This used to default to `bouquets[1]`,
          // an arbitrary index into a list that runs from a ₦1,900 bouquet to a
          // ₦44,500 one — so the confirmation sheet could open pre-filled with
          // a package the customer never chose, needing only a fingerprint to
          // pay for it. Which bouquet someone wants is not guessable.
        })
        .finally(() => {
          if (isMounted) setIsLoadingVariations(false);
        });
    }
    return () => {
      isMounted = false;
    };
  }, [selectedCable, serviceType]);

  // Dynamically fetch live data bundles when telco or category changes
  useEffect(() => {
    let isMounted = true;
    if (serviceType === 'data') {
      setIsLoadingVariations(true);

      // Drop the previous network's selection before fetching the new one.
      // Without this, switching from MTN to a network whose catalogue comes
      // back empty — either because the provider does not carry it or because
      // the lookup failed, both of which return [] — left the MTN plan selected
      // behind a blank list. The total still showed the MTN price and the
      // purchase would have been submitted with the MTN variation code against
      // a Glo number.
      setDynamicDataPlans([]);
      setSelectedDataPlan(null);

      const fetcher = dataCategory === 'sme'
        ? fetchSmeDataPlans(selectedTelco)
        : fetchDynamicVariations('data', selectedTelco);

      fetcher
        .then((plans) => {
          if (!isMounted) return;
          setDynamicDataPlans(plans);
          if (plans.length > 0) {
            const defaultPlan = plans.find((p) => p.name.includes('1.0GB') || p.name.includes('1.5GB') || p.name.includes('1GB')) || plans[0];
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
  }, [selectedTelco, serviceType, dataCategory]);

  /**
   * Clear any confirmed account holder as soon as the number it belonged to is
   * edited.
   *
   * This replaces two "lookup simulation" effects that set the displayed name
   * to a hardcoded string — 'ADEKUNLE OLAITAN (RESIDENTIAL)' for any meter
   * number of ten digits or more, and 'CHUKWUDI EZE (ACTIVE)' for any
   * smartcard. No request was made. A customer typing a meter number saw a
   * plausible name appear beneath it, read that as the network confirming whose
   * meter it was, and paid.
   *
   * The real lookup already exists: runVerification() calls verifyBillAccount()
   * before the confirmation sheet opens, and its result is what the badge shows
   * now. A name is only ever displayed if a provider returned it.
   */
  useEffect(() => {
    setVerifiedName(null);
    setVerifiedAddress(null);
    setVerifyError(null);

    const destination = serviceType === 'power' ? meterNumber : smartcardNumber;
    const provider = serviceType === 'power' ? selectedDisco : selectedCable;
    if (serviceType !== 'power' && serviceType !== 'cable') return;
    if (destination.trim().length < 10) return;

    // Debounced so this is one lookup per finished number rather than one per
    // keystroke. The purchase path verifies again before taking any money —
    // this is only so the customer sees whose account it is while they can
    // still fix a typo for free.
    let cancelled = false;
    setIsAutoVerifying(true);
    const timer = setTimeout(() => {
      verifyBillAccount({
        serviceType,
        provider,
        destination,
        meterType: serviceType === 'power' ? meterType : undefined,
      })
        .then((result) => {
          if (cancelled) return;
          if (result.success) {
            setVerifiedName(result.customerName);
            setVerifiedAddress(result.customerAddress ?? null);
          } else {
            setVerifyError(result.error);
          }
        })
        .finally(() => {
          if (!cancelled) setIsAutoVerifying(false);
        });
    }, 600);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [meterNumber, smartcardNumber, selectedDisco, selectedCable, meterType, serviceType]);

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

  // The account the money comes from, or null when none is linked.
  const activeAccount =
    linkedAccounts && linkedAccounts.length > 0
      ? linkedAccounts[selectedBankIndex] ?? linkedAccounts[0]
      : null;

  // Validation
  const validateForm = (): boolean => {
    if (!activeAccount) {
      Alert.alert(
        'Link a bank account first',
        'MiliPay pays for this straight from your bank, so there needs to be an account linked before you can buy anything.',
      );
      return false;
    }

    if (serviceType === 'airtime' || serviceType === 'data') {
      const cleanPhone = recipientNumber.replace(/[^0-9]/g, '');
      if (cleanPhone.length < 10) {
        Alert.alert('Check the number', 'Enter a valid 11-digit phone number.');
        return false;
      }
    }

    // A data purchase is a specific bundle, not an amount. Nothing downstream
    // can recover if this is missing or stale.
    if (serviceType === 'data' && !selectedDataPlan) {
      Alert.alert(
        'Choose a bundle',
        'Select a data bundle for this network before paying.',
      );
      return false;
    }

    if (serviceType === 'cable' && !selectedBouquet) {
      Alert.alert(
        'Choose a package',
        'Select the package you want to pay for before continuing.',
      );
      return false;
    }

    if (serviceType === 'power') {
      if (meterNumber.trim().length < 8) {
        Alert.alert('Check the meter number', 'Enter a valid meter number.');
        return false;
      }
    } else if (serviceType === 'cable') {
      if (smartcardNumber.trim().length < 8) {
        Alert.alert('Check the smartcard number', 'Enter a valid smartcard or IUC number.');
        return false;
      }
    }

    const payable = getPayableAmount();
    if (!payable || payable < 50) {
      Alert.alert('Amount too small', 'The minimum payment is ₦50.');
      return false;
    }

    return true;
  };

  // Open confirmation sheet
  const handleInitiatePayment = async () => {
    if (!validateForm()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Electricity and cable are verified BEFORE the confirmation sheet, not
    // after payment. Two reasons: BigiSub's own pay endpoints require the
    // account holder's name exactly as their verify call returned it, so
    // skipping it means the purchase is rejected after the customer's bank has
    // already been debited — and it lets the customer catch their own typo by
    // seeing whose meter they are about to credit.
    if (serviceType === 'power' || serviceType === 'cable') {
      const verified = await runVerification();
      if (!verified) return;
    }

    setIsConfirmModalVisible(true);
  };

  /**
   * Every purchase is authorised, not just the large ones. A fingerprint is one
   * touch, so there is no reason to let anyone who picks up an unlocked phone
   * spend from a linked bank account.
   */
  const handleConfirmPayment = async () => {
    setIsConfirmModalVisible(false);
    setEnteredPin('');
    setPinError(null);
    setIsIdentitySheetVisible(true);
  };

  /** Above the PIN threshold the server insists on the PIN itself. */
  const pinIsMandatory = () => getPayableAmount() > (user?.pinThreshold || 10000);

  const handleIdentityConfirmed = async (pin?: string) => {
    setIsIdentitySheetVisible(false);
    await processFinalPayment(pin);
  };

  /** Verify a meter or smartcard before anyone pays for it. */
  const runVerification = async () => {
    if (serviceType !== 'power' && serviceType !== 'cable') return true;

    const destination = serviceType === 'power' ? meterNumber : smartcardNumber;
    const provider = serviceType === 'power' ? selectedDisco : selectedCable;

    setIsVerifying(true);
    const result = await verifyBillAccount({
      serviceType,
      provider,
      destination,
      meterType: serviceType === 'power' ? meterType : undefined,
    });
    setIsVerifying(false);

    if (!result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Could not verify', result.error);
      return false;
    }

    setVerifiedName(result.customerName);
    setVerifiedAddress(result.customerAddress ?? null);
    return true;
  };

  const processFinalPayment = async (pin?: string) => {
    setIsConfirmModalVisible(false);
    setIsProcessing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const payable = getPayableAmount();
    let provider = selectedTelco;
    let destination = recipientNumber;
    let variationCode: string | undefined = undefined;

    if (serviceType === 'airtime') {
      provider = selectedTelco;
      destination = recipientNumber;
    } else if (serviceType === 'data') {
      provider = selectedTelco;
      destination = recipientNumber;
      variationCode = (selectedDataPlan as any)?.variationCode || selectedDataPlan?.id;

    } else if (serviceType === 'power') {
      provider = selectedDisco;
      destination = meterNumber;
      variationCode = meterType;
    } else if (serviceType === 'cable') {
      provider = selectedCable;
      destination = smartcardNumber;
      variationCode = (selectedBouquet as any)?.variationCode || selectedBouquet?.id;

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
        serviceType,
        provider,
        // Only open-value services carry an amount. Bundle prices are resolved
        // server-side from the operator catalogue so they cannot be tampered with.
        amount: serviceType === 'airtime' || serviceType === 'power' ? payable : undefined,
        destination,
        customerPhone: user?.phone || recipientNumber || undefined,
        variationCode,
        meterType: serviceType === 'power' ? meterType : undefined,
        dataCategory: serviceType === 'data' ? dataCategory : undefined,
        // Required by BigiSub for these two, and gathered by runVerification
        // before the customer ever reached the fingerprint.
        customerName: verifiedName ?? undefined,
        customerAddress: verifiedAddress ?? undefined,
        accountId: activeAccount?.id || undefined,
        pin: pin || enteredPin || undefined,
      });

      if (!data || data.success === false) {
        // PIN challenge, or a rejected PIN that can be retried.
        if (data?.requirePin) {
          setIsProcessing(false);
          setPinError(data.message || data.error || '4-digit PIN required');
          setIsPinModalVisible(true);
          return;
        }

        // Fulfilment failed after debit; the server reverses automatically.
        if (data?.code === 'FULFILMENT_FAILED') {
          setIsProcessing(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          Alert.alert(
            data.refunded ? 'Recharge Failed & Refunded' : 'Recharge Failed',
            data.error || data.message || 'The operator could not complete this transaction.'
          );
          return;
        }

        throw new Error(data?.error || data?.message || 'Transaction could not be completed.');
      }

      // NOT success — the purchase has merely been ACCEPTED. The bank has
      // been asked for the money and will confirm by webhook; the airtime is
      // only sent after that. So we open the progress sheet and follow the
      // reference rather than declaring victory here.
      const chargedAmount = Number(data.amount ?? payable);
      const finalRef = data.reference!;
      const finalTitle = data.merchantTitle || 'Quick Service';

      setIsProcessing(false);
      setProgressTitle(`${finalTitle} · ${destination}`);
      setProgressSnapshot({
        reference: finalRef,
        status: 'initiated',
        amount: chargedAmount,
        token: null,
        units: null,
        failureReason: null,
        updatedAt: null,
      });
      setIsProgressVisible(true);

      stopWatchingRef.current?.();
      stopWatchingRef.current = watchTransaction({
        reference: finalRef,
        onUpdate: setProgressSnapshot,
        onSettled: (snapshot) => {
          setProgressSnapshot(snapshot);
          Haptics.notificationAsync(
            isSuccess(snapshot.status)
              ? Haptics.NotificationFeedbackType.Success
              : Haptics.NotificationFeedbackType.Warning,
          );

          // The balance moved, so re-read it rather than guessing.
          const userId = user?.id;
          if (userId) void useBankStore.getState().fetchAccounts(userId);

          if (isSuccess(snapshot.status)) {
            setSuccessReceipt({
              reference: snapshot.reference,
              amount: snapshot.amount,
              merchant: finalTitle,
              beneficiary: destination,
              bank: activeAccount?.bankName || 'MiliPay Linked Account',
              date: new Date().toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }),
              token: snapshot.token,
              units: snapshot.units,
            });
          }
        },
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
            className={`px-2.5 py-1 rounded-full ${serviceType === 'airtime' ? 'bg-signal' : ''}`}
          >
            <Smartphone color={serviceType === 'airtime' ? '#000' : (isDark ? '#94a3b8' : '#64748b')} size={14} />
          </Pressable>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              setServiceType('data');
            }}
            className={`px-2.5 py-1 rounded-full ${serviceType === 'data' ? 'bg-signal' : ''}`}
          >
            <Wifi color={serviceType === 'data' ? '#000' : (isDark ? '#94a3b8' : '#64748b')} size={14} />
          </Pressable>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              setServiceType('power');
            }}
            className={`px-2.5 py-1 rounded-full ${serviceType === 'power' ? 'bg-signal' : ''}`}
          >
            <Lightbulb color={serviceType === 'power' ? '#000' : (isDark ? '#94a3b8' : '#64748b')} size={14} />
          </Pressable>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              setServiceType('cable');
            }}
            className={`px-2.5 py-1 rounded-full ${serviceType === 'cable' ? 'bg-signal' : ''}`}
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
          <View className="flex-row items-center justify-between bg-signal/10 border border-signal/20 rounded-2xl px-4 py-3 mb-5">
            <View className="flex-row items-center flex-1 mr-2">
              <Zap color="#00C896" size={18} className="mr-2" />
              <Text className="text-signal-dim dark:text-signal-bright font-inter-semibold text-xs">
                Enjoy zero convenience fees & instant top-up
              </Text>
            </View>
            <View className="bg-signal/20 px-2 py-0.5 rounded">
              <Text className="text-signal-dim dark:text-signal-bright font-inter-bold text-[10px]">FREE</Text>
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
                        className="bg-signal/15 px-2.5 py-1 rounded-full flex-row items-center"
                      >
                        <Text className="text-signal-dim dark:text-signal-bright font-inter-bold text-[11px]">
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
                              ? 'bg-signal border-signal'
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

              {/* DATA: bundle picker — SME (wholesale) or direct (retail) */}
              {serviceType === 'data' && (
                <View className="bg-white dark:bg-zinc-900 rounded-2xl p-4 mb-4 border border-slate-200 dark:border-zinc-800">
                  {/* Category Segmented Toggle */}
                  <View className="flex-row bg-slate-100 dark:bg-zinc-800/90 p-1 rounded-xl mb-3.5 border border-slate-200/50 dark:border-zinc-700/50">
                    <Pressable
                      onPress={() => {
                        if (dataCategory !== 'sme') {
                          Haptics.selectionAsync();
                          setDataCategory('sme');
                        }
                      }}
                      className={`flex-1 py-2 rounded-lg flex-row items-center justify-center ${
                        dataCategory === 'sme'
                          ? 'bg-white dark:bg-zinc-700 shadow-sm'
                          : ''
                      }`}
                    >
                      <Text
                        className={`text-xs font-inter-bold ${
                          dataCategory === 'sme'
                            ? 'text-signal-dim dark:text-signal-bright'
                            : 'text-slate-500 dark:text-zinc-400'
                        }`}
                      >
                        SME Data (Budget)
                      </Text>
                      <View className="ml-1.5 bg-signal/15 px-1.5 py-0.5 rounded">
                        <Text className="text-signal-dim dark:text-signal-bright font-inter-bold text-[9px]">
                          Save 60%
                        </Text>
                      </View>
                    </Pressable>

                    <Pressable
                      onPress={() => {
                        if (dataCategory !== 'direct') {
                          Haptics.selectionAsync();
                          setDataCategory('direct');
                        }
                      }}
                      className={`flex-1 py-2 rounded-lg flex-row items-center justify-center ${
                        dataCategory === 'direct'
                          ? 'bg-white dark:bg-zinc-700 shadow-sm'
                          : ''
                      }`}
                    >
                      <Text
                        className={`text-xs font-inter-bold ${
                          dataCategory === 'direct'
                            ? 'text-signal-dim dark:text-signal-bright'
                            : 'text-slate-500 dark:text-zinc-400'
                        }`}
                      >
                        Direct Data (Official)
                      </Text>
                      <View className="ml-1.5 bg-slate-200 dark:bg-zinc-600 px-1.5 py-0.5 rounded">
                        <Text className="text-slate-600 dark:text-zinc-300 font-inter-bold text-[9px]">
                          Official
                        </Text>
                      </View>
                    </Pressable>
                  </View>

                  <View className="flex-row items-center justify-between mb-3">
                    <Text className="text-slate-500 dark:text-zinc-400 font-inter-semibold text-xs uppercase tracking-wider">
                      Select {dataCategory === 'sme' ? 'SME Data' : 'Official Data'} ({selectedTelco.toUpperCase()})
                    </Text>
                    <View className="bg-signal/10 px-2 py-0.5 rounded-full">
                      <Text className="text-signal-dim dark:text-signal-bright font-inter-bold text-[10px]">
                        {dataCategory === 'sme' ? 'Wholesale SME' : 'Direct Retail'}
                      </Text>
                    </View>
                  </View>

                  {isLoadingVariations ? (
                    <View className="py-8 items-center justify-center">
                      <ActivityIndicator color={colors.signal.base} size="small" />
                      <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs mt-2">
                        Loading {selectedTelco.toUpperCase()} {dataCategory === 'sme' ? 'SME bundles' : 'data plans'}…
                      </Text>
                    </View>
                  ) : dynamicDataPlans.length === 0 ? (
                    // An empty catalogue used to render as blank space under a
                    // heading — no message, no way forward. It happens whenever
                    // a network does not carry the selected category, and
                    // whenever the lookup fails, since both return [].
                    <CatalogueEmpty
                      title={`No ${dataCategory === 'sme' ? 'SME' : 'direct'} bundles for ${selectedTelco.toUpperCase()}`}
                      body={
                        dataCategory === 'sme'
                          ? 'This network may not offer SME bundles. Try Direct instead.'
                          : 'We could not load this catalogue. Check your connection and try again.'
                      }
                    />
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
                                ? 'bg-emerald-50 dark:bg-signal-dim/40 border-2 border-signal'
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
                                <View className="bg-signal/10 px-1.5 py-0.5 rounded">
                                  <Text className="text-signal-dim dark:text-signal-bright font-inter-bold text-[9px]">
                                    {dataCategory === 'sme' ? 'SME Instant' : 'Instant'}
                                  </Text>
                                </View>
                              </View>
                            </View>
                            <View className="flex-row items-center">
                              <Text className="text-signal-dim dark:text-signal-bright font-inter-bold text-sm mr-2">
                                ₦{bundle.price.toLocaleString()}
                              </Text>
                              {isSelected && <Check color="#00C896" size={18} strokeWidth={2.5} />}
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
                            ? 'bg-signal border-signal'
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
                      meterType === 'prepaid' ? 'bg-signal' : ''
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
                      meterType === 'postpaid' ? 'bg-signal' : ''
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

                <AccountHolderBadge
                  isVerifying={isAutoVerifying}
                  name={verifiedName}
                  address={verifiedAddress}
                  error={verifyError}
                />
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
                            ? 'bg-signal border-signal'
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
                            ? 'bg-signal border-signal'
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

                <AccountHolderBadge
                  isVerifying={isAutoVerifying}
                  name={verifiedName}
                  address={verifiedAddress}
                  error={verifyError}
                />
              </View>

              {/* Package list, fetched live from the provider */}
              <View className="bg-white dark:bg-zinc-900 rounded-2xl p-4 mb-4 border border-slate-200 dark:border-zinc-800">
                <View className="flex-row items-center justify-between mb-3">
                  <Text className="text-slate-500 dark:text-zinc-400 font-inter-semibold text-xs uppercase tracking-wider">
                    Select Package ({selectedCable.toUpperCase()})
                  </Text>
                  <View className="bg-signal/10 px-2 py-0.5 rounded-full">
                    <Text className="text-signal-dim dark:text-signal-bright font-inter-bold text-[10px]">
                      Live Pricing
                    </Text>
                  </View>
                </View>

                {isLoadingVariations ? (
                  <View className="py-8 items-center justify-center">
                    <ActivityIndicator color={colors.signal.base} size="small" />
                    <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs mt-2">
                      Loading {selectedCable.toUpperCase()} packages…
                    </Text>
                  </View>
                ) : dynamicBouquets.length === 0 ? (
                  <CatalogueEmpty
                    title={`No packages for ${selectedCable.toUpperCase()}`}
                    body="We could not load this provider's packages. Check your connection and try again."
                  />
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
                              ? 'bg-emerald-50 dark:bg-signal-dim/40 border-2 border-signal'
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
                            <Text className="text-signal-dim dark:text-signal-bright font-inter-bold text-sm mr-2">
                              ₦{b.price.toLocaleString()}
                            </Text>
                            {isSelected && <Check color="#00C896" size={18} strokeWidth={2.5} />}
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
              <View className="bg-signal/15 px-2 py-0.5 rounded-full">
                <Text className="text-signal-dim dark:text-signal-bright font-inter-bold text-[10px]">
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
                          ? 'border-signal bg-signal/10 dark:bg-signal/15'
                          : 'border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-800/40 active:bg-slate-100'
                      }`}
                    >
                      <View className="flex-row items-center flex-1 mr-2">
                        <View
                          className={`w-9 h-9 rounded-full items-center justify-center mr-3 ${
                            isChosen ? 'bg-signal' : 'bg-slate-200 dark:bg-zinc-700'
                          }`}
                        >
                          <CreditCard color={isChosen ? '#000' : '#94a3b8'} size={18} />
                        </View>
                        <View className="flex-1">
                          <Text
                            className={`font-inter-bold text-sm ${
                              isChosen ? 'text-signal-dim dark:text-signal-bright' : 'text-slate-900 dark:text-white'
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
                          isChosen ? 'border-signal bg-signal' : 'border-slate-300 dark:border-zinc-600'
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
                <View className="flex-row items-center flex-1">
                  <View className="w-10 h-10 rounded-full bg-status-warn/15 items-center justify-center mr-3">
                    <CreditCard color={colors.status.warn} size={20} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-slate-900 dark:text-white font-inter-bold text-sm">
                      No bank account linked
                    </Text>
                    <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs">
                      Link one from the home screen to pay for anything.
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
            className="h-14 rounded-2xl bg-signal active:bg-signal items-center justify-center mb-10"
            style={{
              shadowColor: '#00C896',
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
              {serviceType === 'data' && (
                <View className="flex-row justify-between mb-2">
                  <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs">Plan Type</Text>
                  <Text className="text-slate-900 dark:text-white font-inter-semibold text-xs">
                    {dataCategory === 'sme' ? 'SME Data (Budget)' : 'Direct Data (Official)'}
                  </Text>
                </View>
              )}
              <View className="flex-row justify-between mb-2">
                <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs">Beneficiary</Text>
                <Text className="text-slate-900 dark:text-white font-inter-semibold text-xs">
                  {serviceType === 'power' ? meterNumber : serviceType === 'cable' ? smartcardNumber : recipientNumber}
                </Text>
              </View>
              <View className="flex-row justify-between mb-2">
                <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs">Payment Method</Text>
                <Text className="text-slate-900 dark:text-white font-inter-semibold text-xs">
                  {activeAccount
                    ? `${activeAccount.bankName} (****${activeAccount.accountNumber.slice(-4)})`
                    : 'No account linked'}
                </Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs">Transaction Fee</Text>
                <Text className="text-signal-dim dark:text-signal-bright font-inter-bold text-xs">
                  ₦0.00 (FREE)
                </Text>
              </View>
            </View>

            {/* Confirm & Pay CTA */}
            <Pressable
              onPress={handleConfirmPayment}
              className="h-14 rounded-2xl bg-signal active:bg-signal items-center justify-center"
              style={{
                shadowColor: '#00C896',
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

      {/* The bespoke PIN modal that used to sit here is gone.
          ConfirmIdentitySheet covers both paths now — fingerprint first, PIN
          as the fallback, and the PIN outright above the threshold — and it
          checks the PIN through verify_own_pin, which shares the payment
          path's failed-attempt counter and lockout. The old modal did not:
          it was a softer door into the same account. */}

      {/* Full-Screen Processing Modal (OPay Standard) */}
      <Modal visible={isProcessing} transparent animationType="fade">
        <View className="flex-1 justify-center items-center px-6 bg-black/70">
          <View className="w-full max-w-xs rounded-3xl p-6 bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 items-center">
            <View className="w-16 h-16 rounded-full bg-signal/15 items-center justify-center mb-4">
              <ActivityIndicator size="large" color="#00C896" />
            </View>
            <Text className="text-slate-900 dark:text-white font-inter-bold text-base text-center mb-1">
              Processing Top-Up...
            </Text>
            <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs text-center">
              Connecting with carrier network
            </Text>
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
                <View className="w-22 h-22 rounded-full bg-signal/15 items-center justify-center mb-3">
                  <View
                    className="w-16 h-16 rounded-full bg-signal items-center justify-center"
                    style={{
                      shadowColor: '#00C896',
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
                <Text className="text-slate-900 dark:text-white font-inter-bold text-2xl text-center mb-1 tracking-tight">
                  Payment Successful!
                </Text>
                <Text className="text-signal-dim dark:text-signal-bright font-inter-bold text-3xl mb-4">
                  ₦{successReceipt?.amount?.toLocaleString()}
                </Text>

                {/* PREPAID ELECTRICITY TOKEN CARD (Special Feature) */}
                {successReceipt?.token && (
                  <View className="w-full bg-signal/10 border-2 border-dashed border-signal/40 rounded-2xl p-4 mb-4 items-center">
                    <Text className="text-signal-dim dark:text-signal-bright font-inter-semibold text-xs mb-1 uppercase tracking-wider">
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
                      className="flex-row items-center bg-signal px-4 py-2 rounded-xl active:bg-signal"
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
                    <ActivityIndicator color="#00C896" size="small" />
                  ) : (
                    <>
                      <FileText color="#00C896" size={16} className="mr-1.5" />
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
                    <ActivityIndicator color="#00C896" size="small" />
                  ) : (
                    <>
                      <Share2 color="#00C896" size={16} className="mr-1.5" />
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
                className="w-full h-15 rounded-2xl bg-signal active:bg-signal items-center justify-center shadow-md shadow-signal/20"
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

      {/* Step 4: fingerprint, PIN as the fallback — and the PIN outright once
          the amount is above the customer's threshold, because the server
          verifies the PIN and cannot verify a fingerprint the phone checked. */}
      <ConfirmIdentitySheet
        visible={isIdentitySheetVisible}
        reason={`Authorise ₦${getPayableAmount().toLocaleString('en-NG')} for ${getServiceTitle()}`}
        requirePin={pinIsMandatory()}
        onConfirmed={handleIdentityConfirmed}
        onCancel={() => setIsIdentitySheetVisible(false)}
      />

      {/* Step 5: the few real seconds between the fingerprint and the airtime.
          Every line of it is a fact the server reported. */}
      <PurchaseProgressSheet
        visible={isProgressVisible}
        snapshot={progressSnapshot}
        title={progressTitle}
        onClose={() => {
          // Closing is not cancelling — the money is already moving. The watch
          // is torn down so it does not outlive the screen; the transaction
          // carries on and reconciliation finishes it.
          stopWatchingRef.current?.();
          stopWatchingRef.current = null;
          setIsProgressVisible(false);
        }}
        onViewReceipt={() => setIsProgressVisible(false)}
      />
    </SafeAreaView>
  );
}
