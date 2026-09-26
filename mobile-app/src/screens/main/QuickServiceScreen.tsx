import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Linking,
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
import { paymentAccountView } from '../../lib/paymentAccounts';
import { useQuickPay } from '../../lib/quickPay';
import { paymentMethodLabel } from '../../lib/quickPayCopy';
import {
  fetchDynamicVariations,
  fetchElectricityProviders,
  getActiveVtuMargins,
  executeVtuRecharge,
  verifyBillAccount,
  DynamicVariation,
  VtuMargins,
} from '../../lib/vtuService';
import { ConfirmIdentitySheet } from '../../components/ui/ConfirmIdentitySheet';
import { NetworkLogo } from '../../components/ui/NetworkLogo';
import {
  IS_SANDBOX,
  sandboxMeterCases,
  sandboxPhoneCases,
  sandboxSmartcardCases,
} from '../../lib/environment';
import { PurchaseProgressSheet } from '../../components/ui/PurchaseProgressSheet';
import {
  watchTransaction,
  isSuccess,
  type TransactionSnapshot,
} from '../../lib/transactionStatus';

/**
 * Telco selection. The mark itself lives in NetworkLogo, which holds each
 * carrier's real brand colours; what stays here is only how the SELECTED tile
 * is tinted, which is a MiliPay UI decision rather than a brand one.
 *
 * `badge` and `color` are gone: badge was the coloured dot the logo replaced,
 * and colour was never read by anything.
 */
const TELCOS = [
  { id: 'mtn', name: 'MTN', bg: 'bg-yellow-500/15', border: 'border-yellow-500', text: 'text-yellow-600 dark:text-yellow-400' },
  { id: 'airtel', name: 'Airtel', bg: 'bg-red-500/15', border: 'border-red-500', text: 'text-red-600 dark:text-red-400' },
  { id: 'glo', name: 'Glo', bg: 'bg-signal/15', border: 'border-signal', text: 'text-signal-dim dark:text-signal-bright' },
  { id: '9mobile', name: '9mobile', bg: 'bg-green-600/15', border: 'border-green-600', text: 'text-green-700 dark:text-green-400' },
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

/**
 * Mono will not debit a bank account for less than this. Their floor, not
 * ours, and mirrored by MONO_MINIMUM_DEBIT_NGN in the vtu-service Edge
 * Function, which is where it is actually enforced.
 *
 * https://docs.mono.co/docs/payments/direct-debit/debit-an-account
 */
const MONO_MINIMUM_DEBIT_NGN = 200;

// ₦100 is gone from the presets: Mono would reject it, so offering it as a
// one-tap choice was offering a button that cannot work.
const AIRTIME_PRESETS = [200, 500, 1000, 2000, 5000, 10000];
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

/**
 * The VTPass sandbox's test inputs, offered as chips.
 *
 * Renders NOTHING unless this build declares itself sandbox. IS_SANDBOX is a
 * compile-time constant inlined by Metro, so in a production bundle the guard
 * below is `false === true` and every chip is dead code that never ships —
 * there is no runtime flag, and no server response, that can bring them back.
 *
 * They exist because the VTPass sandbox fails ANY value outside its fixed
 * test list, so without them the first thing anyone testing does is type a
 * real number and watch it fail for reasons that look like our bug.
 */
const SandboxChips = ({
  cases,
  onPick,
}: {
  cases: { label: string; value: string }[];
  onPick: (value: string) => void;
}) => {
  if (!IS_SANDBOX || cases.length === 0) return null;
  return (
    <View className="flex-row flex-wrap items-center mt-2 -mb-1">
      <Text className="text-amber-600 dark:text-amber-400 font-inter-bold text-[9px] uppercase tracking-wider mr-2 mb-1.5">
        Sandbox
      </Text>
      {cases.map((c) => (
        <Pressable
          key={c.value}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onPick(c.value);
          }}
          className="bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 rounded-full mr-1.5 mb-1.5 active:opacity-60"
        >
          <Text className="text-amber-700 dark:text-amber-300 font-inter-bold text-[10px]">
            {c.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
};

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
  const linkedAccounts = useBankStore((s) => s.linkedAccounts);
  const accountsLoading = useBankStore((s) => s.isLoading);
  const accountsError = useBankStore((s) => s.error);
  const fetchAccounts = useBankStore((s) => s.fetchAccounts);
  const activeBankIndex = useBankStore((s) => s.activeBankIndex);
  const setActiveBankIndex = useBankStore((s) => s.setActiveBankIndex);
  const [selectedBankIndex, setSelectedBankIndex] = useState<number>(activeBankIndex || 0);

  // Read the accounts on arrival rather than trusting whatever the home
  // screen last loaded. Opening this screen first — after a reload, say — used
  // to leave the list empty, and a bank linked or unlinked since would show
  // stale. It is one small query.
  useEffect(() => {
    if (user?.id) void fetchAccounts(user.id);
  }, [user?.id, fetchAccounts]);

  const accountView = paymentAccountView({
    count: linkedAccounts.length,
    isLoading: accountsLoading,
    error: accountsError,
  });

  // Which accounts have quick pay on, for the label and badge only. The
  // server decides per purchase whether it is actually used.
  const quickPay = useQuickPay();

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
  // The SME / Direct toggle is gone. Those were BigiSub's two plan shelves;
  // VTPass publishes ONE data catalogue per network, so both sides of the
  // toggle fetched the same list while the UI promised "Save 60%" for picking
  // one of them. A choice that changes nothing, sold as a discount, is worse
  // than no choice at all.

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

  // What the platform adds on top, and what each disco levies. Both are read
  // from the server for display only — it re-derives them when it prices the
  // transaction, so nothing here can be tampered with to pay less.
  const [margins, setMargins] = useState<VtuMargins | null>(null);
  const [discoCharges, setDiscoCharges] = useState<
    Record<string, { serviceCharge: number; serviceChargeType: string; minAmount: number }>
  >({});
  /**
   * Tracked separately from the map being non-empty, and deliberately so.
   *
   * The disco codes in DISCOS below are ours; the ones in this map come from
   * the gateway. If the two ever disagree, "we have no entry for this disco" must
   * not be confused with "we are still loading" — the first would otherwise
   * disable the Pay button for ever with no explanation. Loaded-but-absent
   * means we show what we know and let the server, which looks the charge up
   * itself, be the authority.
   */
  const [discoChargesLoaded, setDiscoChargesLoaded] = useState(false);

  // Modals & confirmation
  const [isConfirmModalVisible, setIsConfirmModalVisible] = useState(false);
  /**
   * Set when the SERVER asked for a PIN — either because the amount crossed
   * the customer's threshold or because the one we sent was wrong. Holding the
   * server's own wording means the customer is told which of the two it was.
   */
  const [pinChallenge, setPinChallenge] = useState<string | null>(null);
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

  // Electricity and cable cannot be paid without the verified account holder:
  // the server refuses to price either without one, and it is what lets the
  // customer catch a typo while it is still free.
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

      fetchDynamicVariations('data', selectedTelco)
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
  }, [selectedTelco, serviceType]);

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

  /**
   * The two things the screen cannot price without.
   *
   * Margins are cheap and apply to every tab, so they load once on mount. The
   * disco list is only fetched when electricity is actually opened — it is a
   * live call to the gateway and there is no reason to make it for someone
   * buying airtime.
   */
  useEffect(() => {
    let cancelled = false;
    void getActiveVtuMargins().then((value) => {
      if (!cancelled) setMargins(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (serviceType !== 'power' || discoChargesLoaded) return;

    let cancelled = false;
    void fetchElectricityProviders()
      .then((providers) => {
        if (cancelled) return;
        const byCode: Record<
          string,
          { serviceCharge: number; serviceChargeType: string; minAmount: number }
        > = {};
        for (const p of providers) {
          byCode[p.code] = {
            serviceCharge: Number(p.serviceCharge) || 0,
            serviceChargeType: p.serviceChargeType,
            minAmount: Number(p.minAmount) || 0,
          };
        }
        setDiscoCharges(byCode);
      })
      .finally(() => {
        // Marked loaded even on an empty or failed result: the screen has
        // stopped waiting, which is the only thing this flag is for.
        if (!cancelled) setDiscoChargesLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [serviceType, discoChargesLoaded]);

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

  /**
   * The same arithmetic the server performs in priceTransaction(), so the
   * figure the customer authorises with their fingerprint is the figure their
   * bank is actually asked for.
   *
   * It did not agree before. Electricity was the bad one: the screen showed
   * the meter amount while the server charged that PLUS the disco's own
   * service charge — a number that only exists in the provider's own list —
   * and the confirmation sheet stated the fee was "₦0.00 (FREE)" underneath
   * it. For data and cable the surcharge is already inside the catalogue
   * price, so the total was right while the fee line was still wrong.
   *
   * `base` is what goes on the wire for open-value services, because the
   * server adds the charges itself; sending the total would have it add them
   * a second time. `total` is the only number the customer should ever see.
   */
  const breakdown = useMemo(() => {
    const round = (n: number) => Math.round(n * 100) / 100;

    if (serviceType === 'data' || serviceType === 'cable') {
      const chosen = serviceType === 'data' ? selectedDataPlan : selectedBouquet;
      // Zero when nothing is chosen yet. This used to fall back to 1200 for
      // data and 5100 for cable, two numbers with no source, so the Pay button
      // quoted a price the server had never given while the catalogue loaded.
      const total = Number(chosen?.price) || 0;
      const base = Number(chosen?.basePrice) || 0;
      return { base, fee: base > 0 ? round(total - base) : 0, serviceCharge: 0, total };
    }

    if (serviceType === 'power') {
      const base = selectedAmount;
      const disco = discoCharges[selectedDisco];
      const serviceCharge = disco
        ? round(
            disco.serviceChargeType === 'percentage'
              ? base * (disco.serviceCharge / 100)
              : disco.serviceCharge,
          )
        : 0;
      const fee = margins?.power_convenience_fee_ngn ?? 0;
      return { base, fee, serviceCharge, total: round(base + serviceCharge + fee) };
    }

    // Airtime. A percentage surcharge, zero on the live settings today, but it
    // is a setting and the screen must follow it rather than assume.
    const base = selectedAmount;
    const fee = round(base * ((margins?.airtime_surcharge_percent ?? 0) / 100));
    return { base, fee, serviceCharge: 0, total: round(base + fee) };
  }, [
    serviceType,
    selectedAmount,
    selectedDataPlan,
    selectedBouquet,
    selectedDisco,
    discoCharges,
    margins,
  ]);

  /** What the customer sees and authorises. */
  const getPayableAmount = () => breakdown.total;

  /**
   * True while a figure on screen might still move — the disco charge has not
   * arrived, or the bundle catalogue is still loading. Authorising during this
   * window is how someone approves one amount and is debited another.
   */
  const isPriceSettling =
    (serviceType === 'power' && !discoChargesLoaded) ||
    ((serviceType === 'data' || serviceType === 'cable') && isLoadingVariations);

  /**
   * True when we could not find this disco's charge and therefore cannot show
   * a final total. The server looks it up itself and will charge correctly;
   * what the customer must not be given is a total presented as complete when
   * it isn't.
   */
  const discoChargeUnknown =
    serviceType === 'power' && discoChargesLoaded && !discoCharges[selectedDisco];

  // The account the money comes from, or null when none is linked.
  const activeAccount =
    linkedAccounts && linkedAccounts.length > 0
      ? linkedAccounts[selectedBankIndex] ?? linkedAccounts[0]
      : null;

  // Validation
  const validateForm = (): boolean => {
    if (!activeAccount) {
      // Only claim there is no bank when a load has actually said so.
      if (accountView === 'loading') {
        Alert.alert('One moment', 'Your bank accounts are still loading.');
      } else if (accountView === 'error') {
        Alert.alert(
          "Couldn't load your bank accounts",
          'Check your connection and tap the payment account to try again.',
        );
      } else {
        Alert.alert(
          'Link a bank account first',
          'MiliPay pays for this straight from your bank, so there needs to be an account linked before you can buy anything.',
        );
      }
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

      // The server rejects anything under the disco's own floor with
      // BELOW_MINIMUM. Catching it here means the customer is told the actual
      // figure before they authorise, rather than after.
      const disco = discoCharges[selectedDisco];
      if (disco && disco.minAmount > 0 && breakdown.base < disco.minAmount) {
        Alert.alert(
          'Below this disco’s minimum',
          `${DISCOS.find((d) => d.id === selectedDisco)?.short ?? 'This provider'} requires at least ₦${disco.minAmount.toLocaleString()}.`,
        );
        return false;
      }
    } else if (serviceType === 'cable') {
      if (smartcardNumber.trim().length < 8) {
        Alert.alert('Check the smartcard number', 'Enter a valid smartcard or IUC number.');
        return false;
      }
    }

    // Checked against the base, which is what the server validates — the
    // charges it adds afterwards cannot make a too-small amount acceptable.
    if (!breakdown.base || breakdown.base < 50) {
      Alert.alert('Amount too small', 'The minimum payment is ₦50.');
      return false;
    }

    // Mono's own floor, not ours. The server refuses below this too; catching
    // it here means the customer is told now rather than after a fingerprint,
    // a transaction opened and a debit rejected behind a spinner.
    if (breakdown.total < MONO_MINIMUM_DEBIT_NGN) {
      Alert.alert(
        'A little more than that',
        `The smallest payment we can take from a bank account is ₦${MONO_MINIMUM_DEBIT_NGN}.`,
      );
      return false;
    }

    if (isPriceSettling) {
      Alert.alert(
        'One moment',
        'We are still confirming the exact charge for this. Try again in a second.',
      );
      return false;
    }

    return true;
  };

  // Open confirmation sheet
  const handleInitiatePayment = async () => {
    if (!validateForm()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Electricity and cable are verified BEFORE the confirmation sheet, not
    // after payment. Two reasons: the server refuses to price either without
    // a verified holder, so skipping it means the purchase is rejected — and
    // it lets the customer catch their own typo by seeing whose meter they are
    // about to credit, while fixing it is still free.
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
    // A fresh attempt starts without the last one's challenge.
    setPinChallenge(null);
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

    const payable = breakdown.total;
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
    }
    // There were three more branches here — internet (spectranet), transport
    // (a hardcoded 'Cowry: 8940192841') and education (waec) — and all three
    // were unreachable dead ends. The server's zod enum accepts only
    // airtime | data | power | cable, so each one was a guaranteed 400, and
    // nothing has navigated here with those types since the service catalogue
    // became the single list both the home row and this screen read from.

    try {
      const data = await executeVtuRecharge({
        serviceType,
        provider,
        // Only open-value services carry an amount, and it is the BASE — the
        // meter or airtime value. The server adds its surcharge and the
        // disco's service charge itself, so sending the total would have it
        // charge those twice.
        //
        // Bundle prices are not sent at all: they are resolved server-side
        // from the operator catalogue so they cannot be tampered with.
        amount:
          serviceType === 'airtime' || serviceType === 'power' ? breakdown.base : undefined,
        destination,
        customerPhone: user?.phone || recipientNumber || undefined,
        variationCode,
        meterType: serviceType === 'power' ? meterType : undefined,

        // Required by the server for these two, and gathered by
        // runVerification before the customer ever reached the fingerprint.
        customerName: verifiedName ?? undefined,
        customerAddress: verifiedAddress ?? undefined,
        accountId: activeAccount?.id || undefined,
        pin: pin || undefined,
      });

      if (!data || data.success === false) {
        // A PIN challenge, or a PIN the server rejected and will accept another
        // attempt at. This used to flip `isPinModalVisible`, which no nothing
        // rendered any more — the bespoke PIN modal was removed in favour of
        // ConfirmIdentitySheet and the setter was left behind. So the screen
        // simply stopped: processing closed, no sheet, no message, no retry.
        //
        // Reopening the identity sheet with the PIN demanded outright is the
        // right answer anyway: it verifies through verify_own_pin, so a wrong
        // attempt counts against the same lockout the payment path uses.
        if (data?.requirePin) {
          setIsProcessing(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          setPinChallenge(data.error || data.message || 'Enter your 4-digit PIN to authorise this.');
          setIsIdentitySheetVisible(true);
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

      // In Mono's one-off DirectPay mode the debit is not merely pending — it
      // has not been authorised at all until the customer completes it at
      // their bank, and this URL is the only way there. Ignoring it left the
      // transaction sitting at `initiated` until the watch timed out, with the
      // customer staring at "Confirming with your bank…" for a confirmation
      // that was never going to arrive.
      //
      // With quick pay (a mandate) the server returns null here and there is
      // nothing to open: the standing authorisation is the whole point.
      if (data.authorisationUrl) {
        try {
          const canOpen = await Linking.canOpenURL(data.authorisationUrl);
          if (canOpen) {
            await Linking.openURL(data.authorisationUrl);
          } else {
            throw new Error('no handler');
          }
        } catch {
          Alert.alert(
            'Finish this at your bank',
            'Your bank needs to approve this payment. We could not open the page automatically — nothing has been charged, so you can safely try again.',
          );
        }
      }

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
                        className={`items-center py-2.5 px-2 rounded-xl border ${
                          isSelected
                            ? `${telco.border} ${telco.bg}`
                            : 'border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-800/40'
                        } flex-1 mx-1`}
                      >
                        {/* The carrier's own mark, not a coloured dot. Four
                            dots in four colours asked the customer to recall
                            which colour meant which network; sending airtime
                            to the wrong one cannot be undone. */}
                        <NetworkLogo network={telco.id} size={30} />
                        <Text
                          numberOfLines={1}
                          className={`font-inter-bold text-[11px] mt-1.5 ${
                            isSelected ? telco.text : 'text-slate-700 dark:text-zinc-300'
                          }`}
                        >
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
                  {user?.phone ? (
                    <Pressable
                      onPress={handleUseMyNumber}
                      className="bg-signal/15 px-2.5 py-1 rounded-full flex-row items-center"
                    >
                      <Text className="text-signal-dim dark:text-signal-bright font-inter-bold text-[11px]">
                        My Number
                      </Text>
                    </Pressable>
                  ) : null}
                </View>

                <SandboxChips cases={sandboxPhoneCases()} onPick={setRecipientNumber} />

                <View className="flex-row items-center h-14 px-4 rounded-xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700 mt-2">
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

              {/* DATA: bundle picker. One catalogue per network — VTPass has no plan shelves. */}
              {serviceType === 'data' && (
                <View className="bg-white dark:bg-zinc-900 rounded-2xl p-4 mb-4 border border-slate-200 dark:border-zinc-800">

                  <View className="flex-row items-center justify-between mb-3">
                    <Text className="text-slate-500 dark:text-zinc-400 font-inter-semibold text-xs uppercase tracking-wider">
                      Select a bundle ({selectedTelco.toUpperCase()})
                    </Text>
                  </View>

                  {isLoadingVariations ? (
                    <View className="py-8 items-center justify-center">
                      <ActivityIndicator color={colors.signal.base} size="small" />
                      <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs mt-2">
                        Loading {selectedTelco.toUpperCase()} bundles…
                      </Text>
                    </View>
                  ) : dynamicDataPlans.length === 0 ? (
                    // An empty catalogue used to render as blank space under a
                    // heading — no message, no way forward. It happens whenever
                    // a network does not carry the selected category, and
                    // whenever the lookup fails, since both return [].
                    <CatalogueEmpty
                      title={`No bundles for ${selectedTelco.toUpperCase()}`}
                      body="We could not load this catalogue. Check your connection and try again."
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
                                    Instant
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
                </View>
                <SandboxChips cases={sandboxMeterCases()} onPick={setMeterNumber} />
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
                </View>
                <SandboxChips cases={sandboxSmartcardCases()} onPick={setSmartcardNumber} />
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
                  {/* Only the server's word makes this "Quick pay": until the
                      bank has activated it, every purchase asks the bank. */}
                  {paymentMethodLabel(quickPay.forAccount(linkedAccounts[selectedBankIndex]?.id)?.state)}
                </Text>
              </View>
            </View>

            {accountView === 'list' ? (
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
                          {quickPay.forAccount(acc.id)?.state === 'on' ? (
                            <View className="flex-row items-center mt-1">
                              <Zap color="#00C896" size={11} />
                              <Text className="text-signal-dim dark:text-signal-bright font-inter-semibold text-[10px] ml-1">
                                Quick pay — fingerprint only
                              </Text>
                            </View>
                          ) : null}
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
            ) : accountView === 'loading' ? (
              <View className="flex-row items-center">
                <ActivityIndicator size="small" color={colors.status.warn} />
                <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs ml-3">
                  Loading your bank accounts…
                </Text>
              </View>
            ) : accountView === 'error' ? (
              // Not "no bank": the accounts could not be READ. Saying none
              // are linked would send the customer to link one they have.
              <Pressable
                onPress={() => {
                  if (user?.id) void fetchAccounts(user.id);
                }}
                className="flex-row items-center justify-between active:opacity-70"
              >
                <View className="flex-row items-center flex-1">
                  <View className="w-10 h-10 rounded-full bg-status-warn/15 items-center justify-center mr-3">
                    <AlertTriangle color={colors.status.warn} size={20} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-slate-900 dark:text-white font-inter-bold text-sm">
                      Couldn't load your bank accounts
                    </Text>
                    <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs">
                      Tap to try again.
                    </Text>
                  </View>
                </View>
              </Pressable>
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
          {/*
            Verification is a live call to the gateway that takes a second or two,
            and it runs BEFORE the confirmation sheet for electricity and
            cable. `isVerifying` was being set the whole time and rendered
            nowhere, so the button sat there looking dead and inviting a second
            tap. It says what it is doing now.
          */}
          <Pressable
            onPress={handleInitiatePayment}
            disabled={isProcessing || isVerifying || isPriceSettling}
            className={`h-14 rounded-2xl items-center justify-center mb-10 ${
              isProcessing || isVerifying || isPriceSettling
                ? 'bg-signal/50'
                : 'bg-signal active:bg-signal'
            }`}
            style={{
              shadowColor: '#00C896',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 10,
              elevation: 4,
            }}
          >
            {isProcessing || isVerifying || isPriceSettling ? (
              <View className="flex-row items-center">
                <ActivityIndicator color="#000" size="small" />
                <Text className="text-black font-inter-bold text-base ml-2.5">
                  {isVerifying
                    ? serviceType === 'power'
                      ? 'Checking this meter…'
                      : 'Checking this smartcard…'
                    : isPriceSettling
                      ? 'Getting the price…'
                      : 'Starting…'}
                </Text>
              </View>
            ) : (
              <Text className="text-black font-inter-bold text-base">
                Pay ₦{getPayableAmount().toLocaleString('en-NG', { minimumFractionDigits: 2 })}
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
              <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs mb-1">
                {discoChargeUnknown ? 'Payable, before your disco’s charge' : 'Total Payable'}
              </Text>
              <Text className="text-slate-900 dark:text-white font-inter-bold text-3xl">
                ₦{getPayableAmount().toLocaleString('en-NG', { minimumFractionDigits: 2 })}
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
                  {activeAccount
                    ? `${activeAccount.bankName} (****${activeAccount.accountNumber.slice(-4)})`
                    : 'No account linked'}
                </Text>
              </View>
              {/*
                This row said "₦0.00 (FREE)" unconditionally. It was false for
                data and cable, where the platform's surcharge is baked into
                the catalogue price, and worse for electricity, where the
                disco's own service charge was added by the server on top of a
                total the customer had already approved.
              */}
              <View className="flex-row justify-between mb-2">
                <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs">
                  {serviceType === 'data' || serviceType === 'cable' ? 'Bundle price' : 'Amount'}
                </Text>
                <Text className="text-slate-900 dark:text-white font-inter-semibold text-xs">
                  ₦{breakdown.base.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                </Text>
              </View>

              {serviceType === 'power' && (breakdown.serviceCharge > 0 || discoChargeUnknown) && (
                <View className="flex-row justify-between mb-2">
                  <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs">
                    {DISCOS.find((d) => d.id === selectedDisco)?.short ?? 'Provider'} service charge
                  </Text>
                  <Text
                    className={`font-inter-semibold text-xs ${
                      discoChargeUnknown
                        ? 'text-status-warn'
                        : 'text-slate-900 dark:text-white'
                    }`}
                  >
                    {discoChargeUnknown
                      ? 'Added by your disco'
                      : `₦${breakdown.serviceCharge.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`}
                  </Text>
                </View>
              )}

              <View className="flex-row justify-between">
                <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs">
                  MiliPay fee
                </Text>
                {breakdown.fee > 0 ? (
                  <Text className="text-slate-900 dark:text-white font-inter-semibold text-xs">
                    ₦{breakdown.fee.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                  </Text>
                ) : (
                  <Text className="text-signal-dim dark:text-signal-bright font-inter-bold text-xs">
                    ₦0.00 (FREE)
                  </Text>
                )}
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
            {/* Nothing has reached a carrier at this point. This modal covers
                the moment between the fingerprint and the server accepting the
                purchase; the bank has not confirmed and the network has not
                been asked. Saying "Connecting with carrier network" here was
                describing a step two states further on. */}
            <Text className="text-slate-900 dark:text-white font-inter-bold text-base text-center mb-1">
              Starting your payment…
            </Text>
            <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs text-center">
              Nothing has been charged yet
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
        reason={
          pinChallenge ??
          `Authorise ₦${getPayableAmount().toLocaleString('en-NG', { minimumFractionDigits: 2 })} for ${getServiceTitle()}`
        }
        // Once the server has asked for the PIN, a fingerprint is no longer an
        // answer: it verifies the PIN itself and cannot verify a fingerprint
        // this phone checked.
        requirePin={pinIsMandatory() || pinChallenge !== null}
        onConfirmed={handleIdentityConfirmed}
        onCancel={() => {
          setIsIdentitySheetVisible(false);
          setPinChallenge(null);
        }}
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
