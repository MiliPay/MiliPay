import { useEffect, useRef, useState } from "react";
import { Animated, Easing, ScrollView, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  ArrowDown, ArrowLeftRight, ArrowRight, ChartPie, Check, ChevronLeft, CloudOff, CreditCard, Eye, EyeOff, Gauge, Hand, HandHelping,
  House, Loader, MessageSquare, Nfc, Pause, Plus, Printer, QrCode, ReceiptText, RotateCcw, Settings, Smartphone, Undo2,
  type LucideIcon,
} from "lucide-react-native";
import { api, PosError, type Tx } from "../api";
import { CARD_PURPLE, K, METHOD_LABEL, N, OUTCOMES, QR_BLUE, TIER2_CAP, timeOf, type Outcome } from "../core";
import { capturePalm, printReceipt } from "../hardware";
import { useStore } from "../state";
import { Btn, Busy, Enter, Header, Keypad, PinDots, Ring, Rows, T, Tap, shadow, useT } from "../ui";

const METHOD_ICON: Record<Tx["method"], LucideIcon> = { palm: Hand, qr: QrCode, card: CreditCard };

/** A row in Recent / Transactions. */
export function TxRow({ tx, first, onPress, showCashier }: { tx: Tx; first: boolean; onPress: () => void; showCashier?: boolean }) {
  const t = useT();
  const Icon = METHOD_ICON[tx.method];
  const palm = tx.method === "palm";
  const paid = tx.status === "Paid";
  return (
    <Tap onPress={onPress} label={`${tx.customer} ${N(tx.amount)}`} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderTopWidth: first ? 0 : 1, borderTopColor: t.line }}>
      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: palm ? t.brandSoft : t.chip, alignItems: "center", justifyContent: "center" }}>
        <Icon size={16} color={palm ? t.brandText : t.muted} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <T size={13} weight="600" lines={1}>{tx.customer}</T>
        <T size={11} color={t.muted} lines={1}>{[METHOD_LABEL[tx.method], timeOf(tx.at), showCashier ? tx.cashier : null].filter(Boolean).join(" · ")}</T>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <T size={13} weight="700" tabular style={paid ? undefined : { textDecorationLine: "line-through" }}>{N(tx.amount)}</T>
        <T size={10} weight="700" color={paid ? t.brandText : t.muted}>{tx.status}</T>
      </View>
    </Tap>
  );
}

// ── 5. Home ───────────────────────────────────────────────────────────────

export function Home() {
  const t = useT();
  const s = useStore();
  const [hide, setHide] = useState(false);
  const [recent, setRecent] = useState<Tx[]>([]);
  const [today, setToday] = useState<{ gross: number; count: number; palmShare: number; bank: string } | null>(null);

  useEffect(() => {
    const { token, session } = s.auth();
    api.transactions(token, session).then((l) => setRecent(l.slice(0, 3))).catch(() => {});
    api.summary(token, session).then(setToday).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cashier = s.shift?.cashier;
  const shortcuts: [string, LucideIcon, string, string, () => void][] = [
    ["History", ReceiptText, t.chip, t.text, () => s.go("history")],
    ["QR code", QrCode, "rgba(59,130,246,.14)", QR_BLUE, () => s.startSale(true)],
    ["End of day", ChartPie, "rgba(168,85,247,.14)", CARD_PURPLE, () => s.go("eod")],
    ["Refund", Undo2, t.failSoft, t.fail, () => s.go("history")],
  ];
  return (
    <Enter>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 14, gap: 12 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.brandSoft, alignItems: "center", justifyContent: "center" }}>
            <T size={12} weight="700" color={t.brandText}>{cashier?.initials ?? ""}</T>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <T size={15} weight="700" lines={1}>{s.me?.merchant.name ?? ""}</T>
            <T size={12} color={t.muted}>{cashier?.name} · {s.me?.terminal.id}</T>
          </View>
          <Tap onPress={() => s.go("settings")} label="Settings" style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, alignItems: "center", justifyContent: "center" }}>
            <Settings size={18} color={t.text} />
          </Tap>
        </View>

        <LinearGradient colors={["#0a7a5a", "#065f46", "#022c22"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 16, borderRadius: 22, overflow: "hidden" }}>
          <View style={{ position: "absolute", right: -40, top: -40, width: 150, height: 150, borderRadius: 75, borderWidth: 1, borderColor: "rgba(51,224,181,.25)" }} />
          <Tap onPress={() => setHide(!hide)} label={hide ? "Show today's sales" : "Hide today's sales"} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <T size={12} color="rgba(255,255,255,.8)">Today's sales</T>
            {hide ? <EyeOff size={14} color="rgba(255,255,255,.8)" /> : <Eye size={14} color="rgba(255,255,255,.8)" />}
          </Tap>
          <T size={30} weight="800" color="#fff" tabular style={{ marginTop: 2, letterSpacing: -0.6 }}>{hide ? "₦ ••••••" : N(today?.gross ?? 0)}</T>
          <View style={{ flexDirection: "row", gap: 14, marginTop: 8 }}>
            <T size={12} color="rgba(255,255,255,.85)">{today?.count ?? 0} payments</T>
            <T size={12} color="rgba(255,255,255,.85)">{Math.round((today?.palmShare ?? 0) * 100)}% by palm</T>
          </View>
          <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,.14)", flexDirection: "row", justifyContent: "space-between" }}>
            <T size={12} color="rgba(255,255,255,.75)">Settles to {today?.bank ?? s.me?.merchant.bank ?? ""}</T>
            <T size={12} weight="700" color="#33E0B5">Instant</T>
          </View>
        </LinearGradient>

        <Tap onPress={() => s.startSale()} label="Charge customer" style={{ height: 76, borderRadius: 22, backgroundColor: t.brand, flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 18, shadowColor: "#00C896", shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 4 }}>
          <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: "rgba(4,18,14,.12)", alignItems: "center", justifyContent: "center" }}>
            <Hand size={24} color={t.onBrand} />
          </View>
          <View style={{ flex: 1 }}>
            <T size={19} weight="800" color={t.onBrand}>Charge customer</T>
            <T size={12} weight="600" color="rgba(4,18,14,.75)">Palm, QR code or card</T>
          </View>
          <ArrowRight size={22} color={t.onBrand} />
        </Tap>

        <View style={{ flexDirection: "row", gap: 8 }}>
          {shortcuts.map(([label, Icon, bg, fg, go]) => (
            <Tap key={label} onPress={go} label={label} style={[{ flex: 1, alignItems: "center", gap: 6, paddingVertical: 10, paddingHorizontal: 2, borderRadius: 16, backgroundColor: t.card, borderWidth: 1, borderColor: t.line }, shadow(t)]}>
              <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
                <Icon size={19} color={fg} />
              </View>
              <T size={11} weight="600" center>{label}</T>
            </Tap>
          ))}
        </View>

        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
          <T size={14} weight="700">Recent</T>
          <Tap onPress={() => s.go("history")} label="See all"><T size={12} weight="600" color={t.brandText}>See all</T></Tap>
        </View>
        <View style={{ backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 18, overflow: "hidden" }}>
          {recent.length ? recent.map((tx, i) => <TxRow key={tx.reference} tx={tx} first={i === 0} onPress={() => s.set({ tx, screen: "tx" })} />) : (
            <T size={13} color={t.muted} center style={{ padding: 16 }}>No payments yet today.</T>
          )}
        </View>
      </ScrollView>
    </Enter>
  );
}

// ── 6. Enter amount ───────────────────────────────────────────────────────

export function Amount() {
  const t = useT();
  const s = useStore();
  const [digits, setDigits] = useState(s.sale.amount ? String(s.sale.amount) : "");
  const amt = Number(digits || 0);
  const threshold = 10000;
  const note = amt > TIER2_CAP ? "Above Tier 2 per-payment cap (₦150,000). Use QR code." : amt > threshold ? "Customer will confirm with their PIN" : "";
  const onKey = (k: string) => {
    if (k === "del") return setDigits(digits.slice(0, -1));
    if ((digits + k).length > 8 || (!digits && k.startsWith("0"))) return;
    setDigits(digits + k);
  };
  const next = () => {
    if (!(amt > 0)) return;
    s.setSale({ amount: amt });
    if (s.sale.toQr) return s.go("qr");
    s.go("method");
  };
  return (
    <Enter from="x" style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 14 }}>
      <Header title="Enter amount" onBack={() => s.go("home")} close />
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 6 }}>
        <T size={amt >= 1e6 ? 40 : 50} weight="800" tabular color={amt ? t.text : t.faint} style={{ letterSpacing: -1.5 }}>{N(amt)}</T>
        <T size={12} color={amt > TIER2_CAP ? t.fail : t.warn} style={{ minHeight: 16 }}>{note}</T>
      </View>
      <View style={{ flexDirection: "row", gap: 6, marginBottom: 10 }}>
        {[1000, 2000, 5000, 10000].map((v) => (
          <Tap key={v} onPress={() => setDigits(String(v))} label={N(v)} style={{ flex: 1, height: 34, borderRadius: 999, backgroundColor: t.chip, alignItems: "center", justifyContent: "center" }}>
            <T size={12} weight="700">{N(v)}</T>
          </Tap>
        ))}
      </View>
      <Keypad onKey={onKey} left="00" height={54} fontSize={24} />
      <View style={{ marginTop: 10 }}>
        <Btn label={`Charge ${N(amt)}`} onPress={next} disabled={!(amt > 0)} height={56} />
      </View>
    </Enter>
  );
}

// ── 7. Payment method ─────────────────────────────────────────────────────

export function Method() {
  const t = useT();
  const s = useStore();
  const methods: { label: string; sub: string; icon: LucideIcon; tag?: string; go: () => void; primary?: boolean; tile: string; fg: string }[] = [
    { label: "Palm", sub: "Customer holds their palm over the scanner", icon: Hand, tag: "Fastest", go: () => s.go("palm"), primary: true, tile: "rgba(4,18,14,.12)", fg: t.onBrand },
    { label: "QR code", sub: "Customer shows their app's QR to the scanner", icon: QrCode, go: () => s.go("qr"), tile: "rgba(59,130,246,.14)", fg: QR_BLUE },
    { label: "Card", sub: "Tap, insert or swipe a bank card", icon: CreditCard, go: () => s.go("card"), tile: "rgba(168,85,247,.14)", fg: CARD_PURPLE },
  ];
  return (
    <Enter from="x" style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 14, gap: 10 }}>
      <Header title="How is the customer paying?" onBack={() => s.go("amount")} />
      <View style={{ alignItems: "center", paddingVertical: 6 }}>
        <T size={12} color={t.muted}>Amount</T>
        <T size={32} weight="800" tabular>{N(s.sale.amount)}</T>
      </View>
      {methods.map((m) => (
        <Tap key={m.label} onPress={m.go} label={m.label} style={[{ flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: 18, backgroundColor: m.primary ? t.brand : t.card, borderWidth: 1.5, borderColor: m.primary ? t.brand : t.line }, shadow(t)]}>
          <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: m.tile, alignItems: "center", justifyContent: "center" }}>
            <m.icon size={24} color={m.fg} />
          </View>
          <View style={{ flex: 1 }}>
            <T size={16} weight="800" color={m.primary ? t.onBrand : t.text}>{m.label}</T>
            <T size={12} color={m.primary ? "rgba(4,18,14,.75)" : t.muted} style={{ marginTop: 1 }}>{m.sub}</T>
          </View>
          {m.tag ? (
            <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: "rgba(4,18,14,.14)" }}>
              <T size={10} weight="800" color={t.onBrand} style={{ letterSpacing: 0.4 }}>{m.tag.toUpperCase()}</T>
            </View>
          ) : null}
        </Tap>
      ))}
    </Enter>
  );
}

// ── 8. Palm scan (+ the phone-digits sheet) ───────────────────────────────

/** Send the palm to MiliPay and land on the right screen. */
async function charge(s: ReturnType<typeof useStore>, pin?: string): Promise<{ pinError?: string }> {
  const { sale } = s;
  if (!sale.capture) return {};
  try {
    const { token, session } = s.auth();
    const approved = await api.payPalm(token, session, {
      amount: sale.amount, reference: sale.reference, irFeatures: sale.capture.irFeatures, rgbFeatures: sale.capture.rgbFeatures,
      phoneLast4: sale.hint || undefined, pin,
    });
    s.set({ result: { ok: true, approved }, screen: "result" });
    const merchant = s.me?.merchant;
    if (s.paper) {
      await printReceipt({
        title: merchant?.name ?? "MiliPay merchant", subtitle: merchant?.address,
        rows: [
          ["Date", new Date().toLocaleDateString("en-GB") + " " + timeOf(new Date().toISOString())], ["Terminal", s.me?.terminal.id ?? ""],
          ["Cashier", s.shift?.cashier.name ?? ""], ["Method", approved.usedPin ? "Palm + PIN" : "Palm"], ["Amount", N(approved.amount)],
          ["Ref", approved.reference.slice(-11)], ["Auth", approved.authCode],
        ],
        status: "APPROVED",
      });
    }
    return {};
  } catch (err) {
    const outcome = err instanceof PosError ? (err.extra.outcome as string | undefined) : undefined;
    if (outcome === "pin") {
      s.setSale({ customerFirst: (err as PosError).extra.firstName ?? null, threshold: (err as PosError).extra.threshold ?? null });
      s.go("pin");
      return {};
    }
    if (outcome === "pin-wrong") {
      const left = (err as PosError).extra.attemptsRemaining;
      return { pinError: `That PIN isn't right.${typeof left === "number" ? ` ${left} ${left === 1 ? "try" : "tries"} left.` : ""}` };
    }
    const known: Outcome[] = ["not-recognised", "paused", "limit", "unavailable", "pin-locked"];
    s.set({ result: { ok: false, outcome: known.includes(outcome as Outcome) ? (outcome as Outcome) : "unavailable" }, screen: "result" });
    return {};
  }
}

export function Palm() {
  const t = useT();
  const s = useStore();
  const [phase, setPhase] = useState<"wait" | "scan" | "match">("wait");
  const [sheet, setSheet] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const line = useRef(new Animated.Value(0)).current;

  const scan = () => {
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    capturePalm((p) => setPhase(p), ctl.signal)
      .then(async (capture) => {
        setPhase("match");
        s.setSale({ capture });
        // Let the state settle so charge() sees the capture.
        await new Promise((r) => setTimeout(r, 0));
      })
      .catch(() => {});
  };

  useEffect(() => {
    scan();
    return () => abort.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (phase === "match" && s.sale.capture) charge(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, s.sale.capture]);
  useEffect(() => {
    if (phase !== "scan") return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(line, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(line, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [phase, line]);

  const title = phase === "wait" ? "Ask the customer to hold their palm over the scanner" : phase === "scan" ? "Hold still…" : "Matching palm…";
  const sub = phase === "wait" ? "Open hand, fingers together, 5–10 cm above the glass." : phase === "scan" ? "Reading palm veins" : s.sale.hint ? `Narrowed with phone ending ${s.sale.hint}` : "Checking with MiliPay";
  const matching = phase === "match";
  return (
    <Enter from="x" style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 14 }}>
      <Header title="Pay with palm" onBack={() => { abort.current?.abort(); s.go("method"); }} close />
      <View style={{ alignItems: "center", marginTop: 6 }}>
        <T size={30} weight="800" tabular>{N(s.sale.amount)}</T>
        <T size={12} color={t.muted}>{s.me?.merchant.name}</T>
      </View>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: 190, height: 190, alignItems: "center", justifyContent: "center" }}>
          {matching ? <View style={{ position: "absolute", width: 190, height: 190, borderRadius: 95, borderWidth: 2, borderColor: t.brand }} /> : <Ring size={190} color={t.brand} />}
          <View style={{ position: "absolute", width: 154, height: 154, borderRadius: 77, backgroundColor: t.brandSoft }} />
          <View style={{ width: 110, height: 110, borderRadius: 55, backgroundColor: matching ? t.brand : t.card, alignItems: "center", justifyContent: "center" }}>
            {matching ? <Loader size={56} color={t.onBrand} strokeWidth={1.6} /> : <Hand size={56} color={t.brandText} strokeWidth={1.6} />}
          </View>
          {phase === "scan" ? (
            <Animated.View style={{ position: "absolute", left: 30, right: 30, top: 15, height: 3, borderRadius: 2, backgroundColor: "#00C896", transform: [{ translateY: line.interpolate({ inputRange: [0, 1], outputRange: [0, 145] }) }] }} />
          ) : null}
        </View>
      </View>
      <View style={{ alignItems: "center", gap: 4, marginBottom: 12 }}>
        <T size={18} weight="800" center>{title}</T>
        <T size={13} color={t.muted} center style={{ paddingHorizontal: 10 }}>{sub}</T>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center", marginBottom: 12 }}>
        <ArrowDown size={14} color={t.brandText} />
        <T size={12} weight="600" color={t.brandText}>Scanner is below the screen</T>
      </View>
      <Tap onPress={() => setSheet(true)} label="Add last 4 digits of phone" style={{ height: 48, borderRadius: 14, borderWidth: 1.5, borderColor: t.line, backgroundColor: t.card, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <Smartphone size={16} color={t.text} />
        <T size={14} weight="600">{s.sale.hint ? `Phone ends in ${s.sale.hint} · change` : "Add last 4 digits of phone (optional)"}</T>
      </Tap>
      {sheet ? <HintSheet onClose={() => setSheet(false)} /> : null}
    </Enter>
  );
}

function HintSheet({ onClose }: { onClose: () => void }) {
  const t = useT();
  const s = useStore();
  const [draft, setDraft] = useState(s.sale.hint);
  const onKey = (k: string) => {
    if (k === "del") return setDraft(draft.slice(0, -1));
    if (draft.length < 4) setDraft(draft + k);
  };
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 15, backgroundColor: "rgba(8,12,10,.5)", justifyContent: "flex-end" }]}>
      <View style={{ backgroundColor: t.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingTop: 18 }}>
        <T size={17} weight="800">Speed up the match</T>
        <T size={12} color={t.muted} style={{ marginTop: 3 }}>Ask the customer for the last 4 digits of their phone number. Their name stays private.</T>
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 10, marginVertical: 14 }}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={{ width: 46, height: 52, borderRadius: 12, backgroundColor: t.chip, borderWidth: 1.5, borderColor: i === draft.length ? t.brand : t.line, alignItems: "center", justifyContent: "center" }}>
              <T size={22} weight="700">{draft[i] ?? ""}</T>
            </View>
          ))}
        </View>
        <Keypad onKey={onKey} height={44} fontSize={19} />
        <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
          <View style={{ flex: 1 }}><Btn label="Cancel" kind="plain" onPress={onClose} height={48} /></View>
          <View style={{ flex: 1 }}><Btn label="Use these digits" disabled={draft.length !== 4} onPress={() => { s.setSale({ hint: draft }); onClose(); }} height={48} /></View>
        </View>
      </View>
    </View>
  );
}

// ── 9. Customer PIN ───────────────────────────────────────────────────────

export function CustomerPin() {
  const t = useT();
  const s = useStore();
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const first = s.sale.customerFirst ?? "there";
  const onKey = async (k: string) => {
    setErr("");
    if (k === "del") return setPin(pin.slice(0, -1));
    if (pin.length >= 4) return;
    const p = pin + k;
    setPin(p);
    if (p.length === 4) {
      setBusy(true);
      const res = await charge(s, p);
      setBusy(false);
      setPin("");
      if (res.pinError) setErr(res.pinError);
    }
  };
  return (
    <Enter from="x" style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 14 }}>
      <View style={{ marginTop: 6, padding: 10, borderRadius: 14, backgroundColor: t.warnSoft, flexDirection: "row", gap: 8, alignItems: "center" }}>
        <HandHelping size={16} color={t.warn} />
        <T size={12} weight="600" color={t.warn}>Hand the terminal to the customer</T>
      </View>
      <View style={{ alignItems: "center", gap: 4, marginTop: 14 }}>
        <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: t.brandSoft, alignItems: "center", justifyContent: "center" }}>
          <T weight="800" color={t.brandText}>{first.slice(0, 1).toUpperCase()}</T>
        </View>
        <T size={17} weight="800" style={{ marginTop: 4 }}>Hi {first}, enter your PIN</T>
        <T size={12} color={t.muted} center>
          {N(s.sale.amount)} is above your Palm-only limit{s.sale.threshold ? ` of ${N(s.sale.threshold)}` : ""}
        </T>
      </View>
      <View style={{ marginTop: 16 }}>
        <PinDots value={pin} error={err || undefined} />
      </View>
      <View style={{ flex: 1 }} />
      <Keypad onKey={onKey} />
      <T size={11} color={t.faint} center style={{ marginTop: 10 }}>The cashier can't see your PIN. Digits are not shown.</T>
      {busy ? <Busy text="Approving" /> : null}
    </Enter>
  );
}

// ── 10. QR code and 11. Card (built, switched off until their backends exist) ──

export function Qr() {
  const t = useT();
  const s = useStore();
  const [left, setLeft] = useState(600);
  useEffect(() => {
    const i = setInterval(() => setLeft((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(i);
  }, []);
  return (
    <Enter from="x" style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 14, gap: 10 }}>
      <Header title="Pay with QR code" onBack={() => s.go(s.sale.toQr ? "amount" : "method")} />
      <View style={{ alignItems: "center" }}>
        <T size={12} color={t.muted}>Customer pays</T>
        <T size={30} weight="800" tabular>{N(s.sale.amount)}</T>
      </View>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: 200, height: 200, alignItems: "center", justifyContent: "center" }}>
          <Ring size={200} color={t.brand} />
          <View style={{ position: "absolute", width: 164, height: 164, borderRadius: 82, backgroundColor: t.brandSoft }} />
          <View style={{ width: 88, height: 150, borderRadius: 18, backgroundColor: "#0B1A15", padding: 7 }}>
            <View style={{ flex: 1, borderRadius: 12, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <QrCode size={52} color="#0B1A15" />
              <T size={7} weight="700" color="#0A6650">MiliPay</T>
            </View>
          </View>
        </View>
      </View>
      <View style={{ alignItems: "center", gap: 4 }}>
        <T size={18} weight="800" center>Ask the customer to show their MiliPay QR</T>
        <T size={13} color={t.muted} center style={{ paddingHorizontal: 10 }}>In the app they tap Pay, confirm with fingerprint or PIN, then hold the phone screen 5–10 cm over the scanner.</T>
      </View>
      <View style={{ padding: 10, borderRadius: 14, backgroundColor: t.warnSoft }}>
        <T size={12} weight="600" color={t.warn} center>QR payments aren't switched on yet. Use palm for now.</T>
      </View>
      <T size={12} color={t.muted} center>Waiting for QR · times out in {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</T>
    </Enter>
  );
}

export function Card() {
  const t = useT();
  const s = useStore();
  return (
    <Enter from="x" style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 14 }}>
      <Header title="Pay by card" onBack={() => s.go("method")} />
      <View style={{ alignItems: "center", marginTop: 6 }}>
        <T size={30} weight="800" tabular>{N(s.sale.amount)}</T>
      </View>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14 }}>
        <View style={{ width: 140, height: 140, alignItems: "center", justifyContent: "center" }}>
          <Ring size={140} color={t.brand} period={1600} />
          <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: t.brandSoft, alignItems: "center", justifyContent: "center" }}>
            <Nfc size={44} color={t.brandText} />
          </View>
        </View>
        <T size={18} weight="800">Tap, insert or swipe</T>
        <T size={13} color={t.muted} center style={{ paddingHorizontal: 20 }}>Use card when the customer hasn't added their palm yet.</T>
      </View>
      <View style={{ padding: 10, borderRadius: 14, backgroundColor: t.warnSoft }}>
        <T size={12} weight="600" color={t.warn} center>Card payments aren't switched on yet. Use palm for now.</T>
      </View>
    </Enter>
  );
}

// ── 12. Result ────────────────────────────────────────────────────────────

const OUTCOME_ICON: Record<Outcome, LucideIcon> = { paused: Pause, "not-recognised": Hand, limit: Gauge, unavailable: CloudOff, "pin-locked": Pause };

export function Result() {
  const t = useT();
  const s = useStore();
  const [toast, setToast] = useState("");
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }).start();
  }, [pop]);
  const r = s.result;
  if (!r) return null;

  const circle = (bg: string, Icon: LucideIcon, fg: string) => (
    <Animated.View style={{ width: 92, height: 92, borderRadius: 46, backgroundColor: bg, alignItems: "center", justifyContent: "center", transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }], opacity: pop }}>
      <Icon size={44} color={fg} strokeWidth={2.5} />
    </Animated.View>
  );

  if (r.ok) {
    const a = r.approved;
    const sms = s.me?.terminal.smsReceipts !== false;
    const sendReceipt = async () => {
      if (!sms) {
        if (s.paper) await printReceipt({ title: s.me?.merchant.name ?? "", subtitle: s.me?.merchant.address, rows: [["Amount", N(a.amount)], ["Ref", a.reference.slice(-11)], ["Auth", a.authCode]], status: "APPROVED" });
        return;
      }
      try {
        const { token, session } = s.auth();
        await s.wait("Sending receipt", () => api.receiptSms(token, session, a.reference));
        setToast("Receipt sent");
      } catch (e) {
        setToast(e instanceof PosError ? e.message : "The receipt couldn't be sent.");
      }
    };
    return (
      <Enter style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14 }}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 8 }}>
          {circle(t.brand, Check, t.onBrand)}
          <T size={12} weight="800" color={t.brandText} style={{ letterSpacing: 1.2, marginTop: 8 }}>APPROVED</T>
          <T size={22} weight="800" center>{N(a.amount)} paid</T>
          <T size={13} color={t.muted} center style={{ paddingHorizontal: 12 }}>
            {a.customerFirstName ?? "The customer"} paid with their palm{a.usedPin ? " and PIN" : ""}.
          </T>
          <View style={{ alignSelf: "stretch", marginTop: 10 }}>
            <Rows rows={[["Reference", a.reference], ["Auth code", a.authCode], ["MiliPay fee", K(a.platformFee)], ["You receive", `${K(a.netMerchantPayout)} · instant`]]} />
          </View>
          {toast ? <T size={12} weight="600" color={t.brandText}>{toast}</T> : null}
        </View>
        <View style={{ gap: 8 }}>
          <Btn label={sms ? "Text receipt to customer" : "Print another copy"} icon={sms ? MessageSquare : Printer} kind="plain" onPress={sendReceipt} />
          <Btn label="New sale" icon={Plus} onPress={() => s.startSale()} />
          <Tap onPress={() => s.go("home")} label="Back to home" style={{ height: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <House size={16} color={t.muted} />
            <T size={14} weight="600" color={t.muted}>Back to home</T>
          </Tap>
        </View>
      </Enter>
    );
  }

  const o = OUTCOMES[r.outcome];
  const fg = o.warn ? t.warn : t.fail;
  const retry = () => {
    s.setSale({ capture: null });
    s.go("palm");
  };
  return (
    <Enter style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14 }}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 8 }}>
        {circle(o.warn ? t.warnSoft : t.failSoft, OUTCOME_ICON[r.outcome], fg)}
        <T size={12} weight="800" color={fg} style={{ letterSpacing: 1.2, marginTop: 8 }}>{o.tag.toUpperCase()}</T>
        <T size={22} weight="800" center>{o.title}</T>
        <T size={13} color={t.muted} center style={{ paddingHorizontal: 12 }}>{o.sub}</T>
      </View>
      <View style={{ gap: 8 }}>
        <Btn label="Use QR code or card" icon={ArrowLeftRight} kind="plain" onPress={() => s.go("method")} />
        {o.retry ? <Btn label="Try palm again" icon={RotateCcw} onPress={retry} /> : <Btn label="Back to amount" icon={ChevronLeft} onPress={() => s.go("amount")} />}
        <Tap onPress={() => s.go("home")} label="Back to home" style={{ height: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <House size={16} color={t.muted} />
          <T size={14} weight="600" color={t.muted}>Back to home</T>
        </Tap>
      </View>
    </Enter>
  );
}
