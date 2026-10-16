import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { LifeBuoy, LogOut, MessageSquare, MonitorSmartphone, Printer, Scan, ShieldCheck, Undo2, Users, Wifi, type LucideIcon } from "lucide-react-native";
import { api, PosError, type Summary, type Tx } from "../api";
import { CARD_PURPLE, K, METHOD_LABEL, N, QR_BLUE, timeOf, type PayMethod } from "../core";
import { printReceipt, SIMULATED } from "../hardware";
import { useStore } from "../state";
import { Btn, Enter, Header, Keypad, PinDots, Rows, T, Tap, useT } from "../ui";
import { TxRow } from "./sale";

// ── 13. Transactions ──────────────────────────────────────────────────────

export function History() {
  const t = useT();
  const s = useStore();
  const [filter, setFilter] = useState<"all" | PayMethod>("all");
  const [list, setList] = useState<Tx[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    setList(null);
    const { token, session } = s.auth();
    api.transactions(token, session, filter === "all" ? undefined : filter).then(setList).catch((e) => {
      setList([]);
      setErr(e instanceof PosError ? e.message : "Couldn't load payments.");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);
  const chips: ["all" | PayMethod, string][] = [["all", "All"], ["palm", "Palm"], ["qr", "QR"], ["card", "Card"]];
  return (
    <Enter from="x" style={{ paddingHorizontal: 16, paddingTop: 4, gap: 10 }}>
      <Header title="Transactions" onBack={() => s.go("home")} />
      <View style={{ flexDirection: "row", gap: 6 }}>
        {chips.map(([id, label]) => (
          <Tap key={id} onPress={() => setFilter(id)} label={label} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: filter === id ? t.text : t.chip }}>
            <T size={12} weight="600" color={filter === id ? t.bg : t.text}>{label}</T>
          </Tap>
        ))}
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 14 }} showsVerticalScrollIndicator={false}>
        <View style={{ backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 18, overflow: "hidden" }}>
          {list === null ? (
            <T size={13} color={t.muted} center style={{ padding: 16 }}>Loading…</T>
          ) : list.length ? (
            list.map((tx, i) => <TxRow key={tx.reference} tx={tx} first={i === 0} showCashier onPress={() => s.set({ tx, screen: "tx" })} />)
          ) : (
            <T size={13} color={err ? t.fail : t.muted} center style={{ padding: 16 }}>{err || "No payments yet."}</T>
          )}
        </View>
      </ScrollView>
    </Enter>
  );
}

// ── 14. Payment details ───────────────────────────────────────────────────

export function TxDetail() {
  const t = useT();
  const s = useStore();
  const tx = s.tx;
  if (!tx) return null;
  const paid = tx.status === "Paid";
  const reprint = () => {
    if (!s.paper) return;
    printReceipt({
      title: s.me?.merchant.name ?? "", subtitle: s.me?.merchant.address,
      rows: [["Date", new Date(tx.at).toLocaleDateString("en-GB") + " " + timeOf(tx.at)], ["Terminal", s.me?.terminal.id ?? ""], ["Cashier", tx.cashier ?? ""], ["Method", METHOD_LABEL[tx.method]], ["Amount", N(tx.amount)], ["Ref", tx.reference.slice(-11)]],
      status: paid ? "APPROVED" : tx.status.toUpperCase(),
    });
  };
  return (
    <Enter from="x" style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 14, gap: 10 }}>
      <Header title="Payment details" onBack={() => s.go("history")} />
      <View style={{ alignItems: "center", paddingVertical: 6 }}>
        <T size={30} weight="800" tabular style={paid ? undefined : { textDecorationLine: "line-through" }}>{N(tx.amount)}</T>
        <View style={{ marginTop: 6, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: paid ? t.brandSoft : t.chip }}>
          <T size={11} weight="700" color={paid ? t.brandText : t.muted}>{tx.status}</T>
        </View>
      </View>
      <Rows rows={[
        ["Customer", tx.customer], ["Method", METHOD_LABEL[tx.method] + (tx.usedPin ? " + PIN" : "")], ["Time", `${new Date(tx.at).toDateString() === new Date().toDateString() ? "Today" : new Date(tx.at).toLocaleDateString("en-GB")}, ${timeOf(tx.at)}`],
        ["Cashier", tx.cashier ?? "—"], ["Reference", tx.reference], ["MiliPay fee", K(tx.fee)], ["You received", K(Math.round((tx.amount - tx.fee) * 100) / 100)],
      ]} />
      <View style={{ flex: 1 }} />
      <Btn label="Reprint receipt" icon={Printer} kind="plain" onPress={reprint} disabled={!s.paper} />
      {tx.refundable ? <Btn label="Refund this payment" icon={Undo2} kind="danger" onPress={() => s.go("refund")} /> : null}
    </Enter>
  );
}

// ── 15. Refund (supervisor PIN) ───────────────────────────────────────────

export function Refund() {
  const t = useT();
  const s = useStore();
  const tx = s.tx;
  const supervisors = (s.me?.cashiers ?? []).filter((c) => c.supervisor);
  const [sup, setSup] = useState(supervisors[0]?.id ?? "");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  if (!tx) return null;
  const onKey = async (k: string) => {
    setErr("");
    if (k === "del") return setPin(pin.slice(0, -1));
    if (pin.length >= 4) return;
    const p = pin + k;
    setPin(p);
    if (p.length < 4) return;
    try {
      const { token, session } = s.auth();
      await s.wait("Requesting the refund", () => api.refund(token, session, tx.reference, sup, p));
      s.set({ tx: { ...tx, status: "Refund requested", refundable: false }, screen: "tx" });
    } catch (e) {
      setPin("");
      setErr(e instanceof PosError ? e.message : "Couldn't request the refund. Try again.");
    }
  };
  return (
    <Enter from="x" style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 14 }}>
      <Header title={`Refund ${N(tx.amount)}`} onBack={() => s.go("tx")} close />
      <View style={{ alignItems: "center", gap: 4, marginTop: 16 }}>
        <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: t.failSoft, alignItems: "center", justifyContent: "center" }}>
          <ShieldCheck size={22} color={t.fail} />
        </View>
        <T size={17} weight="800" style={{ marginTop: 4 }}>Supervisor PIN</T>
        <T size={12} color={t.muted} center style={{ paddingHorizontal: 20 }}>
          Refunds go back to {tx.customer}'s bank account. A supervisor must approve. MiliPay completes the refund.
        </T>
      </View>
      {supervisors.length > 1 ? (
        <View style={{ flexDirection: "row", gap: 6, justifyContent: "center", marginTop: 12 }}>
          {supervisors.map((c) => (
            <Tap key={c.id} onPress={() => { setSup(c.id); setPin(""); }} label={c.name} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: sup === c.id ? t.text : t.chip }}>
              <T size={12} weight="600" color={sup === c.id ? t.bg : t.text}>{c.name}</T>
            </Tap>
          ))}
        </View>
      ) : null}
      <View style={{ marginTop: 16 }}>
        <PinDots value={pin} error={err || undefined} />
      </View>
      <View style={{ flex: 1 }} />
      <Keypad onKey={onKey} />
    </Enter>
  );
}

// ── 16. End of day ────────────────────────────────────────────────────────

const MIX_COLOR: Record<PayMethod, string> = { palm: "#00C896", qr: QR_BLUE, card: CARD_PURPLE };

export function EndOfDay() {
  const t = useT();
  const s = useStore();
  const [sum, setSum] = useState<Summary | null>(null);
  useEffect(() => {
    const { token, session } = s.auth();
    api.summary(token, session).then(setSum).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const printZ = () => {
    if (!sum || !s.paper) return;
    printReceipt({
      title: s.me?.merchant.name ?? "", subtitle: "End-of-day report",
      rows: [["Date", new Date().toLocaleDateString("en-GB")], ["Terminal", s.me?.terminal.id ?? ""], ["Payments", String(sum.count)], ["Gross", N(sum.gross)], ["Refunds", `−${N(sum.refunds)}`], ["Fees", `−${K(sum.fees)}`], ["Net", K(sum.net)]],
      status: "Z-REPORT",
    });
  };
  return (
    <Enter from="x" style={{ paddingHorizontal: 16, paddingTop: 4 }}>
      <Header title="End of day" onBack={() => s.go("home")} />
      <ScrollView contentContainerStyle={{ gap: 10, paddingTop: 10, paddingBottom: 14 }} showsVerticalScrollIndicator={false}>
        <View style={{ padding: 14, borderRadius: 20, backgroundColor: t.card, borderWidth: 1, borderColor: t.line }}>
          <T size={12} color={t.muted}>Total today · {sum?.count ?? 0} payments</T>
          <T size={28} weight="800" tabular>{N(sum?.gross ?? 0)}</T>
          <View style={{ flexDirection: "row", height: 10, borderRadius: 5, overflow: "hidden", marginTop: 12, backgroundColor: t.chip }}>
            {(sum?.mix ?? []).map((m) => <View key={m.method} style={{ height: "100%", width: `${(m.share * 100).toFixed(1)}%` as `${number}%`, backgroundColor: MIX_COLOR[m.method] }} />)}
          </View>
          {(sum?.mix ?? []).map((m) => (
            <View key={m.method} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 9 }}>
              <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: MIX_COLOR[m.method] }} />
              <T size={13} color={t.muted} style={{ flex: 1 }}>{METHOD_LABEL[m.method]} · {m.count}</T>
              <T size={13} weight="700" tabular>{N(m.amount)}</T>
            </View>
          ))}
        </View>
        <Rows strong={3} rows={[
          ["Gross sales", N(sum?.gross ?? 0)], ["Refunds", `−${N(sum?.refunds ?? 0)}`], ["MiliPay fees", `−${K(sum?.fees ?? 0)}`],
          [`Net to ${sum?.bank ?? s.me?.merchant.bank ?? "your bank"}`, K(sum?.net ?? 0)],
          ["Settlement", `Instant${sum?.lastSettledAt ? ` · last at ${timeOf(sum.lastSettledAt)}` : ""}`],
        ]} />
        <View style={{ height: 6 }} />
        <Btn label="Print end-of-day report" icon={Printer} onPress={printZ} disabled={!sum || !s.paper} />
      </ScrollView>
    </Enter>
  );
}

// ── 17. Terminal settings ─────────────────────────────────────────────────

function Toggle({ on }: { on: boolean }) {
  const t = useT();
  return (
    <View style={{ width: 42, height: 24, borderRadius: 12, backgroundColor: on ? t.brand : t.line, padding: 2 }}>
      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "#fff", transform: [{ translateX: on ? 18 : 0 }] }} />
    </View>
  );
}

export function Settings() {
  const t = useT();
  const s = useStore();
  const sms = s.me?.terminal.smsReceipts !== false;
  const setSms = async () => {
    try {
      const { token, session } = s.auth();
      await api.setSmsReceipts(token, session, !sms);
      await s.refreshMe();
    } catch {
      /* the switch stays where it was */
    }
  };
  const rows: { icon: LucideIcon; label: string; sub: string; tint?: string; toggle?: boolean; go?: () => void }[] = [
    { icon: MonitorSmartphone, label: `Terminal ${s.me?.terminal.id ?? ""}`, sub: `Serial ${s.me?.terminal.serial ?? "—"} · paired to ${s.me?.merchant.name ?? ""}` },
    { icon: Scan, label: "Palm scanner", sub: SIMULATED ? "Simulated · real scanner when the terminal arrives" : "Ready", tint: t.brandText },
    { icon: Wifi, label: "Internet", sub: s.online ? "Connected · 4G" : "Offline (demo)", tint: s.online ? t.brandText : t.warn, toggle: s.online, go: () => s.set({ online: !s.online }) },
    { icon: Printer, label: "Receipt paper", sub: s.paper ? "Loaded" : "Out of paper (demo)", tint: s.paper ? t.text : t.fail, toggle: s.paper, go: () => s.set({ paper: !s.paper }) },
    { icon: MessageSquare, label: "Text receipts to customers", sub: "Sent to the number on their MiliPay account", toggle: sms, go: setSms },
    { icon: Users, label: "Cashiers", sub: (s.me?.cashiers ?? []).map((c) => c.name + (c.supervisor ? " (supervisor)" : "")).join(", ") || "—" },
    { icon: LifeBuoy, label: "Support", sub: "Call 0700 MILIPAY · 24/7" },
  ];
  return (
    <Enter from="x" style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 14, gap: 10 }}>
      <Header title="Terminal" onBack={() => s.go("home")} />
      <View style={{ backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 18, overflow: "hidden" }}>
        {rows.map((r, i) => (
          <Tap key={r.label} onPress={r.go} disabled={!r.go} label={r.label} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderTopWidth: i ? 1 : 0, borderTopColor: t.line }}>
            <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: t.chip, alignItems: "center", justifyContent: "center" }}>
              <r.icon size={16} color={r.tint ?? t.text} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <T size={14} weight="600">{r.label}</T>
              <T size={11} color={t.muted}>{r.sub}</T>
            </View>
            {r.toggle !== undefined ? <Toggle on={r.toggle} /> : null}
          </Tap>
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {(["light", "dark"] as const).map((name) => (
          <Tap key={name} onPress={() => s.set({ theme: name })} label={`${name} theme`} style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center", backgroundColor: s.theme === name ? t.text : t.chip }}>
            <T size={13} weight="600" color={s.theme === name ? t.bg : t.text}>{name === "light" ? "Light" : "Dark"}</T>
          </Tap>
        ))}
      </View>
      <View style={{ flex: 1 }} />
      <Btn label="Switch cashier" icon={LogOut} kind="danger" onPress={() => s.set({ shift: null, screen: "lock" })} />
    </Enter>
  );
}
