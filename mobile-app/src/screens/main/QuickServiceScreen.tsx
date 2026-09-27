import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

import { useAuthStore, useBankStore } from '../../store/useStore';
import { paymentAccountView } from '../../lib/paymentAccounts';
import { useQuickPay } from '../../lib/quickPay';
import {
  executeVtuRecharge,
  fetchElectricityProviders,
  fetchPlanCatalogue,
  getActiveVtuMargins,
  verifyBillAccount,
  type DynamicVariation,
  type PlanCatalogue,
  type VtuMargins,
} from '../../lib/vtuService';
import { watchTransaction, type TransactionStatus } from '../../lib/transactionStatus';
import {
  AIRTIME_PRESETS,
  POWER_PRESETS,
  SERVICE_TITLES,
  arrangePlans,
  canPay,
  detectTelco,
  formatPhone,
  payHint,
  payLabel,
  type PayState,
  type PlanCategory,
  type ServiceKey,
  type TelcoId,
} from '../../lib/purchaseForm';
import { loadSavedNumbers, pickContactNumber, rememberNumber, withMyNumber, type SavedNumber } from '../../lib/savedNumbers';
import { IS_SANDBOX, sandboxMeterCases, sandboxPhoneCases, sandboxSmartcardCases } from '../../lib/environment';
import { ScreenHeader } from '../../components/ds/Layout';
import { useThemeColors } from '../../theme/useThemeColors';
import { telcoColors } from '../../theme/tokens';
import { ServiceTabs } from '../../components/purchase/ServiceTabs';
import { PhoneSection } from '../../components/purchase/PhoneSection';
import { AmountSection } from '../../components/purchase/AmountSection';
import { DataPlans } from '../../components/purchase/DataPlans';
import { CABLE_PROVIDERS, CableSection, DISCOS, HolderCheck, PackageList, PowerSection } from '../../components/purchase/BillSections';
import { PayBar } from '../../components/purchase/PayBar';
import { ConfirmPayContent, type PayFromAccount } from '../../components/purchase/ConfirmPaySheet';
import { AuthContent } from '../../components/purchase/AuthSheet';
import { ProgressContent } from '../../components/purchase/ProgressSheet';
import { SandboxChips } from '../../components/purchase/SandboxChips';
import { BottomSheet } from '../../components/ds/BottomSheet';

/**
 * Quick services: airtime, data, electricity and cable TV, paid straight from
 * a linked bank account. The redesign's purchase screen (design handoff,
 * screen 15) and its confirm → approve → progress → receipt flow (screen 16).
 *
 * The server owns every number that matters: it prices the purchase, checks
 * the account holder, verifies the PIN above the customer's threshold, and
 * moves the money only after the bank confirms. This screen shows the same
 * arithmetic so the total approved is the total charged, and follows the
 * purchase's real status to the receipt.
 */

type Sheet = 'confirm' | 'auth' | 'progress' | null;

const SERVICE_KEYS: ServiceKey[] = ['airtime', 'data', 'power', 'cable'];

function asService(value: unknown): ServiceKey {
  return SERVICE_KEYS.includes(value as ServiceKey) ? (value as ServiceKey) : 'airtime';
}

export default function QuickServiceScreen({ route, navigation }: any) {
  const c = useThemeColors();

  const user = useAuthStore((state) => state.user);
  const linkedAccounts = useBankStore((s) => s.linkedAccounts);
  const accountsLoading = useBankStore((s) => s.isLoading);
  const accountsError = useBankStore((s) => s.error);
  const fetchAccounts = useBankStore((s) => s.fetchAccounts);
  const activeBankIndex = useBankStore((s) => s.activeBankIndex);

  // Read the accounts on arrival rather than trusting whatever the home
  // screen last loaded: a bank linked or unlinked since would otherwise show
  // stale, and opening this screen first after a reload left the list empty.
  useEffect(() => {
    if (user?.id) void fetchAccounts(user.id);
  }, [user?.id, fetchAccounts]);

  // "No bank account linked" only once a load has actually said so.
  const accountView = paymentAccountView({
    count: linkedAccounts.length,
    isLoading: accountsLoading,
    error: accountsError,
  });
  const quickPay = useQuickPay();

  // ── The form ───────────────────────────────────────────────
  const [service, setService] = useState<ServiceKey>(asService(route?.params?.serviceType));
  const [phone, setPhone] = useState('');
  const [telco, setTelco] = useState<TelcoId>('mtn');
  const [amount, setAmount] = useState(service === 'power' ? 5000 : 1000);

  const [catalogue, setCatalogue] = useState<PlanCatalogue>({ plans: [], popular: [] });
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [planTab, setPlanTab] = useState<PlanCategory>('daily');
  const [plan, setPlan] = useState<DynamicVariation | null>(null);

  const [disco, setDisco] = useState<string>('ikedc');
  const [meterType, setMeterType] = useState<'prepaid' | 'postpaid'>('prepaid');
  const [meter, setMeter] = useState('');

  const [cable, setCable] = useState<string>('gotv');
  const [card, setCard] = useState('');
  const [packages, setPackages] = useState<DynamicVariation[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [pkg, setPkg] = useState<DynamicVariation | null>(null);

  // Who the provider says owns the meter or card. Only ever what a provider
  // returned — a hardcoded name confirming a number nobody checked is how a
  // customer credits a stranger's meter.
  const [holder, setHolder] = useState<{ checking: boolean; name: string | null; sub: string | null; error: string | null; address: string | null }>({
    checking: false,
    name: null,
    sub: null,
    error: null,
    address: null,
  });

  const [margins, setMargins] = useState<VtuMargins | null>(null);
  const [discoCharges, setDiscoCharges] = useState<Record<string, { serviceCharge: number; serviceChargeType: string; minAmount: number }>>({});
  const [discoChargesLoaded, setDiscoChargesLoaded] = useState(false);

  const [saved, setSaved] = useState<SavedNumber[]>([]);

  // ── The flow ───────────────────────────────────────────────
  const [sheet, setSheet] = useState<Sheet>(null);
  // What the sheet last showed, kept while it slides away so it does not
  // empty out mid-animation.
  const lastSheet = useRef<Exclude<Sheet, null>>('confirm');
  if (sheet) lastSheet.current = sheet;
  const [payFromIndex, setPayFromIndex] = useState(activeBankIndex || 0);
  /** Set when the SERVER asked for a PIN — its own words say why. */
  const [pinPrompt, setPinPrompt] = useState<string | null>(null);
  const [progressStatus, setProgressStatus] = useState<TransactionStatus>('initiated');
  const stopWatchingRef = useRef<(() => void) | null>(null);

  useEffect(() => () => stopWatchingRef.current?.(), []);

  // Saved numbers, re-read when the screen comes back into view.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void loadSavedNumbers().then((list) => {
        if (!cancelled) setSaved(list);
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  // Margins are cheap and apply to every tab.
  useEffect(() => {
    let cancelled = false;
    void getActiveVtuMargins().then((m) => {
      if (!cancelled) setMargins(m);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Disco charges and minimums: only when electricity is opened.
  useEffect(() => {
    if (service !== 'power' || discoChargesLoaded) return;
    let cancelled = false;
    void fetchElectricityProviders()
      .then((providers) => {
        if (cancelled) return;
        const byCode: typeof discoCharges = {};
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
        // Loaded even when empty: the screen has stopped waiting, which is all
        // this flag means. The server looks the charge up itself regardless.
        if (!cancelled) setDiscoChargesLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [service, discoChargesLoaded]);

  // Data plans for the chosen network. The previous network's plan is dropped
  // first: a Glo number must never be sent with an MTN variation code.
  useEffect(() => {
    if (service !== 'data') return;
    let cancelled = false;
    setPlan(null);
    setCatalogue({ plans: [], popular: [] });
    setLoadingPlans(true);
    void fetchPlanCatalogue('data', telco)
      .then((result) => {
        if (cancelled) return;
        setCatalogue(result);
        const { tabs } = arrangePlans(result.plans, result.popular);
        setPlanTab(tabs.includes('daily') ? 'daily' : tabs[0] ?? 'daily');
      })
      .finally(() => {
        if (!cancelled) setLoadingPlans(false);
      });
    return () => {
      cancelled = true;
    };
  }, [service, telco]);

  // Cable packages for the chosen provider. Nothing is pre-selected: which
  // package someone wants is not guessable, and a guess would need only a
  // fingerprint to pay for.
  useEffect(() => {
    if (service !== 'cable') return;
    let cancelled = false;
    setPkg(null);
    setPackages([]);
    setLoadingPackages(true);
    void fetchPlanCatalogue('cable', cable)
      .then((result) => {
        if (!cancelled) setPackages(result.plans);
      })
      .finally(() => {
        if (!cancelled) setLoadingPackages(false);
      });
    return () => {
      cancelled = true;
    };
  }, [service, cable]);

  // Check the meter or smartcard once the number is complete (debounced to
  // one lookup per finished number). Any change clears the previous answer.
  useEffect(() => {
    setHolder({ checking: false, name: null, sub: null, error: null, address: null });
    if (service !== 'power' && service !== 'cable') return;
    const destination = service === 'power' ? meter : card;
    const needed = service === 'power' ? 11 : 10;
    if (destination.length < needed) return;

    let cancelled = false;
    setHolder((h) => ({ ...h, checking: true }));
    const timer = setTimeout(() => {
      void verifyBillAccount({
        serviceType: service,
        provider: service === 'power' ? disco : cable,
        destination,
        meterType: service === 'power' ? meterType : undefined,
      }).then((result) => {
        if (cancelled) return;
        if (result.success) {
          const sub =
            service === 'power'
              ? result.customerAddress || null
              : result.currentBouquet
                ? `Current package: ${result.currentBouquet}`
                : null;
          setHolder({ checking: false, name: result.customerName, sub, error: null, address: result.customerAddress ?? null });
        } else {
          setHolder({ checking: false, name: null, sub: null, error: result.error, address: null });
        }
      });
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [service, meter, card, disco, cable, meterType]);

  // ── What it costs ──────────────────────────────────────────
  /**
   * The same arithmetic as the server's priceTransaction(), so the figure
   * approved is the figure charged. `base` goes on the wire for open-value
   * services (the server adds its charges itself); `total` is what the
   * customer sees; `fee` is everything on top of the base.
   */
  const breakdown = useMemo(() => {
    const round = (n: number) => Math.round(n * 100) / 100;
    if (service === 'data' || service === 'cable') {
      const chosen = service === 'data' ? plan : pkg;
      const total = Number(chosen?.price) || 0;
      const base = Number(chosen?.baseAmount) || 0;
      return { base, total, fee: base > 0 ? round(total - base) : 0 };
    }
    if (service === 'power') {
      const base = amount;
      const d = discoCharges[disco];
      const serviceCharge = d
        ? round(d.serviceChargeType === 'percentage' ? base * (d.serviceCharge / 100) : d.serviceCharge)
        : 0;
      const fee = round(serviceCharge + (margins?.power_convenience_fee_ngn ?? 0));
      return { base, total: round(base + fee), fee };
    }
    const base = amount;
    const fee = round(base * ((margins?.airtime_surcharge_percent ?? 0) / 100));
    return { base, total: round(base + fee), fee };
  }, [service, amount, plan, pkg, disco, discoCharges, margins]);

  const settling =
    (service === 'power' && !discoChargesLoaded) ||
    (service === 'data' && loadingPlans) ||
    (service === 'cable' && loadingPackages);

  const payState: PayState = {
    service,
    accounts: accountView,
    phone,
    amount: breakdown.base,
    hasPlan: !!plan,
    hasPackage: !!pkg,
    verified: !!holder.name,
    verifying: holder.checking,
    settling,
    discoMinimum: service === 'power' ? discoCharges[disco]?.minAmount ?? 0 : 0,
    fee: breakdown.fee,
    testNumbers: IS_SANDBOX,
  };
  const ready = canPay(payState);
  const hint = payHint(payState, DISCOS.find((d) => d.id === disco)?.short);

  // ── What is being bought, in the design's words ────────────
  const planViews = useMemo(() => arrangePlans(catalogue.plans, catalogue.popular), [catalogue]);
  const planView = plan ? planViews.views.find((v) => v.plan === plan) : undefined;
  const telcoName = telcoColors[telco].name;
  const discoName = DISCOS.find((d) => d.id === disco)?.name ?? '';
  const cableName = CABLE_PROVIDERS.find((p) => p.id === cable)?.name ?? '';

  const summary = useMemo((): { title: string; to: string; rows: [string, string][] } => {
    switch (service) {
      case 'airtime':
        return { title: `${telcoName} Airtime`, to: formatPhone(phone), rows: [['Network', telcoName], ['Phone number', formatPhone(phone)]] };
      case 'data':
        return {
          title: `${telcoName} Data ${planView?.size ?? ''}`.trim(),
          to: formatPhone(phone),
          rows: [
            ['Plan', planView ? [planView.size, planView.validity].filter(Boolean).join(' · ') : '—'],
            ['Phone number', formatPhone(phone)],
          ],
        };
      case 'power':
        return {
          title: discoName.replace(/ \(.*\)/, ''),
          to: `Meter ${meter}`,
          rows: [
            ['Meter', `${meter} · ${meterType === 'prepaid' ? 'Prepaid' : 'Postpaid'}`],
            ['Account name', holder.name ?? '—'],
          ],
        };
      case 'cable':
        return {
          title: `${cableName} ${pkg?.name ?? ''}`.trim(),
          to: `Smartcard ${card}`,
          rows: [
            ['Smartcard', card],
            ['Account name', holder.name ?? '—'],
          ],
        };
    }
  }, [service, telcoName, phone, planView, discoName, meter, meterType, holder.name, cableName, pkg, card]);

  const payFrom: PayFromAccount | null = useMemo(() => {
    if (linkedAccounts.length === 0) return null;
    const index = payFromIndex < linkedAccounts.length ? payFromIndex : 0;
    const a = linkedAccounts[index];
    return {
      id: a.id,
      bankName: a.bankName,
      accountNumber: a.accountNumber,
      index,
      quickPay: quickPay.forAccount(a.id)?.state ?? null,
    };
  }, [linkedAccounts, payFromIndex, quickPay]);

  // ── Actions ────────────────────────────────────────────────
  const openService = (next: ServiceKey) => {
    if (next === service) return;
    Haptics.selectionAsync().catch(() => {});
    setService(next);
    setPlan(null);
    setPkg(null);
    setMeter('');
    setCard('');
    setAmount(next === 'power' ? 5000 : 1000);
  };

  const onPhone = (digits: string) => {
    setPhone(digits);
    const detected = detectTelco(digits);
    if (detected) setTelco(detected);
  };

  const pickContact = async () => {
    const result = await pickContactNumber();
    if (result.ok) {
      onPhone(result.entry.phone);
      setSaved(await rememberNumber(result.entry));
    } else if (result.reason === 'no-number') {
      Alert.alert('No mobile number', "That contact doesn't have a Nigerian mobile number saved.");
    } else if (result.reason === 'unavailable') {
      Alert.alert('Contacts unavailable', 'MiliPay could not open your contacts. You can type the number instead.');
    }
  };

  const onPay = () => {
    if (!ready) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setPayFromIndex(activeBankIndex < linkedAccounts.length ? activeBankIndex : 0);
    setPinPrompt(null);
    setSheet('confirm');
  };

  const pinRequired = pinPrompt !== null || breakdown.total > (user?.pinThreshold || 10000);

  const destination = service === 'power' ? meter : service === 'cable' ? card : phone;
  const provider = service === 'power' ? disco : service === 'cable' ? cable : telco;

  const submit = async (pin?: string) => {
    setSheet('progress');
    setProgressStatus('initiated');

    const data = await executeVtuRecharge({
      serviceType: service,
      provider,
      // Open-value services carry the BASE; the server adds its own charges.
      // Bundle prices are never sent — the server reads them from the catalogue.
      amount: service === 'airtime' || service === 'power' ? breakdown.base : undefined,
      destination,
      customerPhone: user?.phone || undefined,
      variationCode: service === 'data' ? plan?.variation_code : service === 'cable' ? pkg?.variation_code : service === 'power' ? meterType : undefined,
      meterType: service === 'power' ? meterType : undefined,
      customerName: holder.name ?? undefined,
      customerAddress: holder.address ?? undefined,
      accountId: payFrom?.id,
      pin,
    });

    if (!data || data.success === false) {
      if (data?.requirePin) {
        // The server wants the PIN (above the threshold, or the last one was
        // wrong). Back to the approval sheet, PIN only, in its words.
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        setPinPrompt(data.error || data.message || 'Enter your PIN to approve this amount.');
        setSheet('auth');
        return;
      }
      setSheet(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert("This payment didn't start", data?.error || data?.message || 'Nothing was charged. Please try again.');
      return;
    }

    const reference = data.reference!;
    const fee = data.amount != null && data.baseAmount != null ? Math.max(0, Number(data.amount) - Number(data.baseAmount)) : breakdown.fee;

    // A purchase still waiting for the bank's approval (DirectPay): Mono's page
    // is the only way to give it, so it opens straight away. With quick pay on
    // there is nothing to open.
    if (data.authorisationUrl) {
      try {
        await Linking.openURL(data.authorisationUrl);
      } catch {
        Alert.alert(
          'Approve at your bank',
          "We couldn't open your bank's approval page. Nothing has been charged — you can safely try again.",
        );
      }
    }

    const boughtFor = service === 'airtime' || service === 'data' ? phone : null;

    stopWatchingRef.current?.();
    stopWatchingRef.current = watchTransaction({
      reference,
      onUpdate: (snap) => setProgressStatus(snap.status),
      onSettled: (snap) => {
        const delivered = snap.status === 'delivered';
        Haptics.notificationAsync(
          delivered ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning,
        ).catch(() => {});
        if (user?.id) void fetchAccounts(user.id);
        // A number that has now actually received airtime or data becomes a
        // one-tap chip next time.
        if (delivered && boughtFor && boughtFor.length === 11 && !withMyNumber(saved, user?.phone).some((s) => s.phone === boughtFor)) {
          void rememberNumber({ label: formatPhone(boughtFor), phone: boughtFor });
        }
        setSheet(null);
        navigation.replace('Receipt', {
          service,
          reference: snap.reference,
          status: snap.status,
          amount: snap.amount || Number(data.amount) || breakdown.total,
          fee,
          title: data.merchantTitle || summary.title,
          to: summary.to,
          accountLabel: payFrom ? `${payFrom.bankName} ••${payFrom.accountNumber.slice(-4)}` : '',
          date: new Date().toISOString(),
          token: snap.token,
          units: snap.units,
        });
      },
    });
  };

  // ── Layout ─────────────────────────────────────────────────
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScreenHeader title={SERVICE_TITLES[service]} onBack={() => navigation.goBack()} />
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 170 }}>
          <ServiceTabs value={service} onChange={openService} />

          {service === 'airtime' || service === 'data' ? (
            <>
              <PhoneSection
                phone={phone}
                onPhone={onPhone}
                telco={telco}
                onTelco={setTelco}
                saved={withMyNumber(saved, user?.phone)}
                onPickContact={() => void pickContact()}
              />
              <SandboxChips cases={sandboxPhoneCases()} onPick={onPhone} />
            </>
          ) : null}

          {service === 'power' ? (
            <>
              <PowerSection disco={disco} onDisco={setDisco} meterType={meterType} onMeterType={setMeterType} meter={meter} onMeter={setMeter} />
              <SandboxChips cases={sandboxMeterCases()} onPick={setMeter} />
            </>
          ) : null}

          {service === 'cable' ? (
            <>
              <CableSection provider={cable} onProvider={setCable} card={card} onCard={setCard} />
              <SandboxChips cases={sandboxSmartcardCases()} onPick={setCard} />
            </>
          ) : null}

          {service === 'power' || service === 'cable' ? (
            <HolderCheck checking={holder.checking} name={holder.name} sub={holder.sub} error={holder.error} />
          ) : null}

          {service === 'airtime' || service === 'power' ? (
            <AmountSection presets={service === 'power' ? POWER_PRESETS : AIRTIME_PRESETS} amount={amount} onAmount={setAmount} />
          ) : null}

          {service === 'data' ? (
            <DataPlans
              views={planViews.views}
              tabs={planViews.tabs}
              tab={planTab}
              onTab={setPlanTab}
              selectedKey={plan ? `${plan.variation_code}` : null}
              keyOf={(p) => p.variation_code}
              onSelect={setPlan}
              loading={loadingPlans}
              emptyText={`${telcoName} data plans are unavailable right now. Try again shortly.`}
            />
          ) : null}

          {service === 'cable' ? (
            <PackageList packages={packages} selectedCode={pkg?.variation_code ?? null} onSelect={setPkg} loading={loadingPackages} />
          ) : null}
        </ScrollView>

        <PayBar hint={hint} label={payLabel(breakdown.total)} enabled={ready} onPay={onPay} />
      </KeyboardAvoidingView>

      {/* One sheet, three steps swapped in place — as in the prototype. A
          sheet per step would stack native modals, which iOS refuses. */}
      <BottomSheet
        visible={sheet !== null}
        dismissible={sheet !== 'progress'}
        onClose={() => {
          setSheet(null);
          setPinPrompt(null);
        }}
      >
        {lastSheet.current === 'confirm' ? (
          <ConfirmPayContent
            service={service}
            title={summary.title}
            total={breakdown.total}
            rows={summary.rows}
            fee={breakdown.fee}
            account={payFrom}
            canChangeAccount={linkedAccounts.length > 1}
            onChangeAccount={() => setPayFromIndex((i) => (i + 1) % linkedAccounts.length)}
            onConfirm={() => setSheet('auth')}
          />
        ) : lastSheet.current === 'auth' ? (
          <AuthContent
            active={sheet === 'auth'}
            total={breakdown.total}
            title={summary.title}
            pinRequired={pinRequired}
            pinPrompt={pinPrompt}
            onApproved={(pin) => void submit(pin)}
          />
        ) : (
          <ProgressContent status={progressStatus} />
        )}
      </BottomSheet>
    </SafeAreaView>
  );
}
