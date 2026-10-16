import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { BatteryMedium, ChevronLeft, Delete, Printer, Wifi, WifiOff, X, type LucideIcon } from "lucide-react-native";
import { THEMES, type Theme, type ThemeName } from "./core";

/** The pieces every screen shares (design handoff: keypad, PIN dots, loader…). */

export const ThemeCtx = createContext<Theme>(THEMES.light);
export const useT = () => useContext(ThemeCtx);
export const themeOf = (name: ThemeName) => THEMES[name];

export const MARK = require("../assets/splash-mark.png");

export function T(props: { children: ReactNode; size?: number; weight?: "400" | "500" | "600" | "700" | "800"; color?: string; style?: StyleProp<TextStyle>; tabular?: boolean; center?: boolean; lines?: number }) {
  const t = useT();
  return (
    <Text
      numberOfLines={props.lines}
      style={[
        {
          fontFamily: `Inter_${props.weight ?? "400"}`,
          fontSize: props.size ?? 14,
          color: props.color ?? t.text,
          textAlign: props.center ? "center" : undefined,
          fontVariant: props.tabular ? ["tabular-nums"] : undefined,
        },
        props.style,
      ]}
    >
      {props.children}
    </Text>
  );
}

export function shadow(t: Theme): ViewStyle {
  return t.shadow ? { shadowColor: "#0a281e", shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 } : {};
}

/** A pressable that shrinks a little when pressed, like the prototype's style-active. */
export function Tap({ onPress, style, children, disabled, label }: { onPress?: () => void; style?: StyleProp<ViewStyle>; children: ReactNode; disabled?: boolean; label?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [style, pressed && !disabled ? { transform: [{ scale: 0.97 }] } : null]}
    >
      {children}
    </Pressable>
  );
}

export function Btn({ label, onPress, kind = "primary", icon: Icon, disabled, color, height = 52 }: { label: string; onPress?: () => void; kind?: "primary" | "plain" | "danger"; icon?: LucideIcon; disabled?: boolean; color?: string; height?: number }) {
  const t = useT();
  const primary = kind === "primary";
  const fg = primary ? t.onBrand : kind === "danger" ? t.fail : color ?? t.text;
  return (
    <Tap
      onPress={onPress}
      disabled={disabled}
      label={label}
      style={{
        height, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
        backgroundColor: primary ? t.brand : t.card, borderWidth: 1.5, borderColor: primary ? t.brand : t.line, opacity: disabled ? 0.4 : 1,
      }}
    >
      {Icon ? <Icon size={18} color={fg} /> : null}
      <T size={primary ? 16 : 15} weight={primary ? "800" : "700"} color={fg}>{label}</T>
    </Tap>
  );
}

export function RoundIcon({ icon: Icon, onPress, label }: { icon: LucideIcon; onPress?: () => void; label: string }) {
  const t = useT();
  return (
    <Tap onPress={onPress} label={label} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, alignItems: "center", justifyContent: "center" }}>
      <Icon size={label === "Close" ? 18 : 20} color={t.text} />
    </Tap>
  );
}

/** A screen's top row: back or close, a centred title. */
export function Header({ title, onBack, close }: { title: string; onBack?: () => void; close?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, height: 40 }}>
      {onBack ? <RoundIcon icon={close ? X : ChevronLeft} onPress={onBack} label={close ? "Close" : "Back"} /> : <View style={{ width: 38 }} />}
      <T size={15} weight="700" center style={{ flex: 1 }}>{title}</T>
      <View style={{ width: 38 }} />
    </View>
  );
}

/** The 3×4 keypad. `left` is the bottom-left key ("00" on the amount screen). */
export function Keypad({ onKey, left = "", height = 52, fontSize = 22 }: { onKey: (k: string) => void; left?: string; height?: number; fontSize?: number }) {
  const t = useT();
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", left, "0", "del"];
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {keys.map((k, i) => (
        <Tap
          key={i}
          disabled={k === ""}
          onPress={() => onKey(k)}
          label={k === "del" ? "Delete" : k}
          style={[{ width: "31.6%", height, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: k === "" ? "transparent" : t.key }, k === "" ? null : shadow(t)]}
        >
          {k === "del" ? <Delete size={20} color={t.text} /> : <T size={fontSize} weight="600">{k}</T>}
        </Tap>
      ))}
    </View>
  );
}

/** Shakes when `error` turns on (wrong PIN). */
export function useShake(error: boolean) {
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!error) return;
    Animated.sequence([-2, -6, 6, -6, 6, -2, 0].map((v) => Animated.timing(x, { toValue: v, duration: 55, useNativeDriver: true }))).start();
  }, [error, x]);
  return { transform: [{ translateX: x }] };
}

export function PinDots({ value, error, length = 4 }: { value: string; error?: string; length?: number }) {
  const t = useT();
  const shake = useShake(Boolean(error));
  return (
    <View style={{ alignItems: "center", gap: 6 }}>
      <Animated.View style={[{ flexDirection: "row", gap: 14, justifyContent: "center" }, shake]}>
        {Array.from({ length }, (_, i) => {
          const filled = i < value.length;
          const c = error ? t.fail : filled ? t.brand : t.faint;
          return <View key={i} style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: c, backgroundColor: filled || error ? (error ? t.fail : t.brand) : "transparent" }} />;
        })}
      </Animated.View>
      <T size={12} color={t.fail} center style={{ minHeight: 16 }}>{error ?? ""}</T>
    </View>
  );
}

/** The heartbeat (design: beat, 1.3 s). */
export function Beat({ size = 110, period = 1300 }: { size?: number; period?: number }) {
  const s = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const seg = (to: number, f: number) => Animated.timing(s, { toValue: to, duration: period * f, easing: Easing.inOut(Easing.ease), useNativeDriver: true });
    const loop = Animated.loop(Animated.sequence([seg(1.14, 0.14), seg(1, 0.14), seg(1.09, 0.14), seg(1, 0.28), seg(1, 0.3)]));
    loop.start();
    return () => loop.stop();
  }, [s, period]);
  return <Animated.Image source={MARK} style={{ width: size, height: size, transform: [{ scale: s }] }} resizeMode="contain" />;
}

/** Every blocking wait: the mark and one line (design: Loader). */
export function Busy({ text }: { text: string }) {
  const t = useT();
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 20, backgroundColor: t.bg, alignItems: "center", justifyContent: "center", gap: 16 }]}>
      <Beat />
      <T size={14} weight="600" color={t.muted}>{text}</T>
    </View>
  );
}

/** A ring that grows and fades (design: ring). */
export function Ring({ size, color, period = 1800, inset = 0 }: { size: number; color: string; period?: number; inset?: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: period, easing: Easing.out(Easing.ease), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v, period]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute", top: inset, left: inset, width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: color,
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }),
        transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.35] }) }],
      }}
    />
  );
}

/** Rises into place when shown (design: rise / screenIn). */
export function Enter({ children, from = "y", style }: { children: ReactNode; from?: "x" | "y"; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [v]);
  const shift = v.interpolate({ inputRange: [0, 1], outputRange: [from === "x" ? 20 : 10, 0] });
  return <Animated.View style={[{ flex: 1, opacity: v, transform: [from === "x" ? { translateX: shift } : { translateY: shift }] }, style]}>{children}</Animated.View>;
}

/** Key/value rows in a card (result, payment details, end of day). */
export function Rows({ rows, strong }: { rows: [string, string][]; strong?: number }) {
  const t = useT();
  return (
    <View style={{ backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 4 }}>
      {rows.map(([k, v], i) => (
        <View key={k} style={{ flexDirection: "row", justifyContent: "space-between", gap: 10, paddingVertical: 9, borderTopWidth: i ? 1 : 0, borderTopColor: t.line }}>
          <T size={13} color={t.muted}>{k}</T>
          <T size={13} weight={i === strong ? "800" : "600"} color={i === strong ? t.brandText : t.text} tabular style={{ textAlign: "right", flexShrink: 1 }}>{v}</T>
        </View>
      ))}
    </View>
  );
}

/** Time, network, paper, battery (design: "Status bar (always visible)"). */
export function StatusBar({ online, paper }: { online: boolean; paper: boolean }) {
  const t = useT();
  const now = new Date();
  const clock = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const Net = online ? Wifi : WifiOff;
  return (
    <View style={{ height: 30, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 8 }}>
      <T size={12} weight="600" color={t.muted} style={{ flex: 1 }}>{clock}</T>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Net size={13} color={online ? t.muted : t.warn} />
        <T size={12} weight="600" color={online ? t.muted : t.warn}>{online ? "4G" : "Offline"}</T>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
        <Printer size={13} color={paper ? t.muted : t.fail} />
        <T size={12} weight="600" color={paper ? t.muted : t.fail}>{paper ? "Paper" : "No paper"}</T>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
        <BatteryMedium size={15} color={t.muted} />
        <T size={12} weight="600" color={t.muted}>78%</T>
      </View>
    </View>
  );
}

export function Logo({ size }: { size: number }) {
  return <Image source={MARK} style={{ width: size, height: size }} resizeMode="contain" />;
}
