import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { CircleAlert, Eye, EyeOff, LockKeyhole } from "lucide-react-native";
import { api, PosError } from "../api";
import { localPhone } from "../core";
import { deviceSerial } from "../hardware";
import { useStore } from "../state";
import { Beat, Btn, Enter, Keypad, Logo, PinDots, T, Tap, useT } from "../ui";

// ── 1. Splash ─────────────────────────────────────────────────────────────

export function Splash() {
  const s = useStore();
  const ring = useRef(new Animated.Value(0)).current;
  const next = () => s.go(s.token ? "lock" : "signin");
  useEffect(() => {
    Animated.loop(Animated.timing(ring, { toValue: 1, duration: 2000, easing: Easing.out(Easing.ease), useNativeDriver: true })).start();
    const t = setTimeout(next, 2400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.token]);
  return (
    <Pressable onPress={next} style={[StyleSheet.absoluteFill, { zIndex: 30 }]} accessibilityLabel="Skip">
      <LinearGradient colors={["#0a7a5a", "#065f46", "#022c22"]} start={{ x: 0.5, y: 0.2 }} end={{ x: 0.5, y: 1 }} style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 18 }}>
        <View style={{ width: 150, height: 150, alignItems: "center", justifyContent: "center" }}>
          <View style={{ position: "absolute", top: -30, left: -30, right: -30, bottom: -30, borderRadius: 999, borderWidth: 1, borderColor: "rgba(51,224,181,.18)" }} />
          <Animated.View
            style={{
              position: "absolute", top: -6, left: -6, right: -6, bottom: -6, borderRadius: 999, borderWidth: 2, borderColor: "rgba(51,224,181,.45)",
              opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }),
              transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.35] }) }],
            }}
          />
          <Beat size={120} period={1600} />
        </View>
        <View style={{ alignItems: "center", gap: 4 }}>
          <T size={28} weight="800" color="#fff" style={{ letterSpacing: -0.5 }}>MiliPay</T>
          <T size={13} weight="700" color="#33E0B5" style={{ letterSpacing: 1.8 }}>MERCHANT TERMINAL</T>
        </View>
        <T size={11} color="rgba(255,255,255,.55)" style={{ position: "absolute", bottom: 26 }}>Payments in milliseconds</T>
      </LinearGradient>
    </Pressable>
  );
}

// ── 2. First login ────────────────────────────────────────────────────────

export function SignIn() {
  const t = useT();
  const s = useStore();
  const [phone, setPhone] = useState("");
  const [pass, setPass] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const ready = phone.replace(/\D/g, "").length >= 10 && pass.length >= 1;

  const submit = async () => {
    if (!ready) return;
    const d = localPhone(phone);
    if (!d) return setErr("Enter the 10 digits after +234.");
    try {
      const res = await s.wait("Signing in", async () => api.login(d, pass, await deviceSerial()));
      await s.signedIn(res.token, res.setupGrant);
      s.go("setpin");
    } catch (e) {
      setErr(e instanceof PosError ? e.message : "Couldn't sign in. Try again.");
    }
  };

  const field = { height: 52, borderRadius: 16, backgroundColor: t.card, borderWidth: 1.5, borderColor: t.line, flexDirection: "row" as const, alignItems: "center" as const, gap: 10, paddingHorizontal: 14 };
  const input = { flex: 1, minWidth: 0, height: "100%" as const, fontSize: 16, color: t.text, fontFamily: "Inter_600" };
  return (
    <Enter style={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 16, gap: 14 }}>
      <View style={{ alignItems: "center", gap: 6, marginBottom: 6 }}>
        <Logo size={64} />
        <T size={22} weight="800" center style={{ marginTop: 6 }}>Log in to this terminal</T>
        <T size={13} color={t.muted} center>Use the phone number and password from your MiliPay merchant account.</T>
      </View>
      {err ? (
        <View style={{ padding: 10, borderRadius: 14, backgroundColor: t.failSoft, flexDirection: "row", gap: 8 }}>
          <CircleAlert size={16} color={t.fail} />
          <T size={13} color={t.fail} style={{ flex: 1 }}>{err}</T>
        </View>
      ) : null}
      <View style={{ gap: 6 }}>
        <T size={12} weight="600" color={t.muted}>Phone number</T>
        <View style={field}>
          <T weight="600" color={t.muted} style={{ paddingRight: 10, borderRightWidth: 1, borderRightColor: t.line }}>+234</T>
          <TextInput value={phone} onChangeText={(v) => { setPhone(v.replace(/[^0-9 ]/g, "").slice(0, 13)); setErr(""); }} inputMode="tel" placeholder="803 123 4567" placeholderTextColor={t.faint} style={input} accessibilityLabel="Phone number" />
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <T size={12} weight="600" color={t.muted}>Password</T>
        <View style={field}>
          <TextInput value={pass} onChangeText={(v) => { setPass(v); setErr(""); }} secureTextEntry={!show} placeholder="Enter your password" placeholderTextColor={t.faint} style={[input, { fontFamily: "Inter_400" }]} accessibilityLabel="Password" onSubmitEditing={submit} />
          <Tap onPress={() => setShow(!show)} label={show ? "Hide password" : "Show password"}>
            {show ? <EyeOff size={18} color={t.faint} /> : <Eye size={18} color={t.faint} />}
          </Tap>
        </View>
      </View>
      <View style={{ flex: 1 }} />
      <Btn label="Log in" onPress={submit} disabled={!ready} height={56} />
      <T size={12} color={t.muted} center>Forgot your password? Call 0700 MILIPAY</T>
    </Enter>
  );
}

// ── 3. Set PIN (once per device) ──────────────────────────────────────────

export function SetPin() {
  const t = useT();
  const s = useStore();
  const [first, setFirst] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");

  const full = async (p: string) => {
    if (!first) {
      setFirst(p);
      setPin("");
      return;
    }
    if (p !== first) {
      setFirst("");
      setPin("");
      return setErr("PINs didn't match. Start again.");
    }
    try {
      const shift = await s.wait("Saving your PIN", () => api.setPin(s.token!, s.setupGrant ?? "", p));
      s.set({ shift, setupGrant: null });
      await s.refreshMe();
      s.go("home");
    } catch (e) {
      setFirst("");
      setPin("");
      setErr(e instanceof PosError ? e.message : "Couldn't save your PIN. Try again.");
    }
  };

  const onKey = (k: string) => {
    setErr("");
    if (k === "del") return setPin(pin.slice(0, -1));
    if (pin.length >= 4) return;
    const p = pin + k;
    setPin(p);
    if (p.length === 4) setTimeout(() => full(p), 160);
  };

  return (
    <Enter from="x" style={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 16 }}>
      <View style={{ flexDirection: "row", gap: 6 }}>
        <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: t.brand }} />
        <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: first ? t.brand : t.line }} />
      </View>
      <View style={{ alignItems: "center", gap: 6, marginTop: 22 }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: t.brandSoft, alignItems: "center", justifyContent: "center" }}>
          <LockKeyhole size={26} color={t.brandText} />
        </View>
        <T size={22} weight="800" center style={{ marginTop: 6 }}>{first ? "Enter your PIN again" : "Create your 4-digit PIN"}</T>
        <T size={13} color={t.muted} center style={{ paddingHorizontal: 10 }}>
          {first ? "Just to make sure." : "You'll use it to unlock this terminal each time instead of your password."}
        </T>
      </View>
      <View style={{ marginTop: 20 }}>
        <PinDots value={pin} error={err || undefined} />
      </View>
      <View style={{ flex: 1 }} />
      <Keypad onKey={onKey} />
    </Enter>
  );
}

// ── 4. PIN login ──────────────────────────────────────────────────────────

export function Lock() {
  const t = useT();
  const s = useStore();
  const [cashier, setCashier] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    s.refreshMe().then((me) => {
      if (me && !cashier) setCashier(me.cashiers[0]?.id ?? null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tryPin = async (p: string) => {
    if (!cashier) return;
    try {
      const shift = await api.unlock(s.token!, cashier, p);
      await s.wait("Signing in", async () => {
        s.set({ shift });
      });
      setPin("");
      s.go("home");
    } catch (e) {
      setPin("");
      setErr(e instanceof PosError ? e.message : "Couldn't check your PIN. Try again.");
    }
  };

  const onKey = (k: string) => {
    setErr("");
    if (k === "del") return setPin(pin.slice(0, -1));
    if (pin.length >= 4) return;
    const p = pin + k;
    setPin(p);
    if (p.length === 4) setTimeout(() => tryPin(p), 160);
  };

  return (
    <Enter style={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 16 }}>
      <View style={{ alignItems: "center", gap: 6 }}>
        <Logo size={60} />
        <T size={18} weight="800" style={{ marginTop: 4 }}>{s.me?.merchant.name ?? " "}</T>
        <T size={12} color={t.muted}>{s.me ? `Terminal ${s.me.terminal.id}` : " "}</T>
      </View>
      <T size={12} weight="600" color={t.muted} style={{ marginTop: 18 }}>Who's on the till? Enter your PIN</T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
        {(s.me?.cashiers ?? []).map((c) => {
          const on = c.id === cashier;
          return (
            <Tap
              key={c.id}
              label={c.name}
              onPress={() => { setCashier(c.id); setPin(""); setErr(""); }}
              style={{ width: "31.6%", paddingVertical: 10, borderRadius: 14, backgroundColor: t.card, borderWidth: 1.5, borderColor: on ? t.brand : t.line, alignItems: "center", gap: 6 }}
            >
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: on ? t.brand : t.chip, alignItems: "center", justifyContent: "center" }}>
                <T size={12} weight="700" color={on ? t.onBrand : t.muted}>{c.initials}</T>
              </View>
              <T size={12} weight="600">{c.name}</T>
            </Tap>
          );
        })}
      </View>
      <View style={{ marginTop: 18 }}>
        <PinDots value={pin} error={err || undefined} />
      </View>
      <View style={{ flex: 1 }} />
      <Keypad onKey={onKey} height={50} />
      <Tap onPress={s.signOut} label="Forgot PIN? Log in with phone and password" style={{ paddingTop: 10 }}>
        <T size={13} weight="600" color={t.brandText} center>Forgot PIN? Log in with phone and password</T>
      </Tap>
    </Enter>
  );
}
