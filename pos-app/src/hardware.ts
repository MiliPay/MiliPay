import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

/**
 * Everything the terminal's hardware does, behind one boundary.
 *
 * The HF-HP605PV's palm scanner, printer and card/QR reader come with the
 * vendor's Android SDK (docs/palm-scanner-integration.md). Until the device
 * arrives these are simulated; the real versions replace the bodies below
 * through a native module, and nothing above this file changes.
 */

export interface PalmCapture {
  irFeatures: string;
  rgbFeatures: string | null;
}

export interface Receipt {
  title: string;
  subtitle?: string | null;
  rows: [string, string][];
  status: string;
}

export const SIMULATED = true;

/** The device serial number, which MiliPay registers against the merchant. */
export async function deviceSerial(): Promise<string> {
  return process.env.EXPO_PUBLIC_POS_SERIAL || "MP-P5-00921";
}

/**
 * Wait for a palm over the scanner and return its templates. The phases let
 * the screen show "Ask the customer…" → "Hold still…" as the design does.
 */
export async function capturePalm(onPhase: (phase: "wait" | "scan") => void, signal: AbortSignal): Promise<PalmCapture> {
  const step = (ms: number) =>
    new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, ms);
      signal.addEventListener("abort", () => {
        clearTimeout(t);
        reject(new DOMException("cancelled", "AbortError"));
      });
    });
  onPhase("wait");
  await step(1400);
  onPhase("scan");
  await step(1600);
  // A simulated capture. The matcher won't recognise it; with the real
  // scanner these are the SDK's ir_features / rgb_features.
  return { irFeatures: "SIMULATED-IR", rgbFeatures: "SIMULATED-RGB" };
}

let paperListener: ((r: Receipt) => void) | null = null;
/** The screen shows simulated paper; the real printer prints instead. */
export function onPrint(listener: ((r: Receipt) => void) | null) {
  paperListener = listener;
}

export async function printReceipt(receipt: Receipt): Promise<void> {
  paperListener?.(receipt);
}

// ── The device token, kept across restarts ─────────────────────────────────

const TOKEN_KEY = "milipay-pos-device";

export async function loadToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      return window.localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function saveToken(token: string | null): Promise<void> {
  if (Platform.OS === "web") {
    try {
      if (token) window.localStorage.setItem(TOKEN_KEY, token);
      else window.localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* private window: the terminal asks to log in again next time */
    }
    return;
  }
  if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}
