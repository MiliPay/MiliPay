import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, Platform, Pressable, View } from "react-native";
import { StatusBar as SystemBar } from "expo-status-bar";
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold } from "@expo-google-fonts/inter";
import { WifiOff } from "lucide-react-native";
import { onPrint, type Receipt } from "./src/hardware";
import { StoreProvider, useStore, type Screen } from "./src/state";
import { Busy, StatusBar, T, ThemeCtx, themeOf, useT } from "./src/ui";
import { Lock, SetPin, SignIn, Splash } from "./src/screens/auth";
import { Amount, Card, CustomerPin, Home, Method, Palm, Qr, Result } from "./src/screens/sale";
import { EndOfDay, History, Refund, Settings, TxDetail } from "./src/screens/records";

/**
 * MiliPay POS: the merchant terminal app (merchant-portal/design_handoff_pos),
 * for the HF-HP605PV Android palm-vein terminal.
 */

const SCREENS: Record<Exclude<Screen, "splash">, () => ReactNode> = {
  signin: SignIn, setpin: SetPin, lock: Lock, home: Home, amount: Amount, method: Method, palm: Palm, pin: CustomerPin,
  qr: Qr, card: Card, result: Result, history: History, tx: TxDetail, refund: Refund, eod: EndOfDay, settings: Settings,
};

/** Simulated receipt paper, until the terminal's printer does it for real. */
function Paper() {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const slide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    onPrint((r) => {
      setReceipt(r);
      slide.setValue(0);
      Animated.timing(slide, { toValue: 1, duration: 1600, easing: Easing.linear, useNativeDriver: true }).start();
    });
    return () => onPrint(null);
  }, [slide]);
  if (!receipt) return null;
  const mono = Platform.select({ ios: "Menlo", android: "monospace", default: "ui-monospace, Menlo, monospace" });
  return (
    <Pressable onPress={() => setReceipt(null)} accessibilityLabel="Dismiss receipt" style={{ position: "absolute", top: 34, left: 0, right: 0, alignItems: "center", zIndex: 40 }}>
      <Animated.View style={{ width: 220, backgroundColor: "#FBFBF7", paddingHorizontal: 16, paddingTop: 14, paddingBottom: 18, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 10, elevation: 6, transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [-260, 0] }) }] }}>
        <T size={13} weight="700" color="#222" center style={{ fontFamily: mono }}>{receipt.title}</T>
        {receipt.subtitle ? <T size={11} color="#222" center style={{ fontFamily: mono }}>{receipt.subtitle}</T> : null}
        <View style={{ borderTopWidth: 1, borderStyle: "dashed", borderColor: "#999", marginVertical: 6 }} />
        {receipt.rows.map(([k, v]) => (
          <View key={k} style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
            <T size={11} color="#222" style={{ fontFamily: mono }}>{k}</T>
            <T size={11} color="#222" style={{ fontFamily: mono }}>{v}</T>
          </View>
        ))}
        <View style={{ borderTopWidth: 1, borderStyle: "dashed", borderColor: "#999", marginVertical: 6 }} />
        <T size={11} weight="700" color="#222" center style={{ fontFamily: mono }}>*** {receipt.status} ***</T>
        <T size={11} color="#222" center style={{ fontFamily: mono, marginTop: 4 }}>Paid with MiliPay</T>
      </Animated.View>
    </Pressable>
  );
}

function Terminal() {
  const s = useStore();
  const t = useT();
  const Current = s.screen === "splash" ? null : SCREENS[s.screen];
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <SystemBar style={s.theme === "dark" || s.screen === "splash" ? "light" : "dark"} />
      <StatusBar online={s.online} paper={s.paper} />
      {!s.online ? (
        <View style={{ marginHorizontal: 12, marginBottom: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: t.warnSoft, flexDirection: "row", gap: 8, alignItems: "center" }}>
          <WifiOff size={14} color={t.warn} />
          <T size={12} weight="600" color={t.warn} style={{ flex: 1 }}>No internet. Palm payments need a connection. QR and card need it too.</T>
        </View>
      ) : null}
      <View style={{ flex: 1 }}>{Current ? <Current key={s.screen} /> : null}</View>
      {s.screen === "splash" ? <Splash /> : null}
      {s.busy ? <Busy text={s.busy} /> : null}
      <Paper />
    </View>
  );
}

function Themed() {
  const s = useStore();
  return (
    <ThemeCtx.Provider value={themeOf(s.theme)}>
      {/* On the web preview, a terminal-sized screen; on the device, full screen. */}
      <View style={{ flex: 1, backgroundColor: Platform.OS === "web" ? "#E7ECEA" : undefined, alignItems: "center", justifyContent: "center" }}>
        <View style={Platform.OS === "web" ? { width: 392, height: 760, maxWidth: "100%", maxHeight: "100%", borderRadius: 26, overflow: "hidden" } : { flex: 1, alignSelf: "stretch" }}>
          <Terminal />
        </View>
      </View>
    </ThemeCtx.Provider>
  );
}

export default function App() {
  const [loaded] = useFonts({
    Inter_400: Inter_400Regular, Inter_500: Inter_500Medium, Inter_600: Inter_600SemiBold, Inter_700: Inter_700Bold, Inter_800: Inter_800ExtraBold,
  });
  if (!loaded) return null;
  return (
    <StoreProvider>
      <Themed />
    </StoreProvider>
  );
}
