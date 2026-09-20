/**
 * Palm-vein capture.
 *
 * Real captures come from the HFSecurity SDK through a native bridge that the
 * rugged Android shell (HF-FP08PV / VP930Pro) injects into the webview. In a
 * plain desktop browser there is no scanner, so capture is either simulated —
 * loudly, and only when explicitly enabled — or refused.
 *
 * The previous implementation silently returned a fake template from a
 * setTimeout, which meant a browser with no hardware attached could enrol a
 * customer whose biometrics did not exist.
 */

/** Marker prefix carried by every simulated template so it is identifiable downstream. */
export const SIMULATED_TEMPLATE_PREFIX = "SIMULATED-PVT-";

export interface PalmCapture {
  /** Base64 IR feature template, or a marked simulated value. */
  template: string;
  /** SDK quality score, 0..1. */
  score: number;
  /** 0 = left, 1 = right, per the HFSecurity SDK. */
  palmType: 0 | 1;
  simulated: boolean;
}

/** Native bridge contract implemented by PalmScannerModule in the Android shell. */
interface PalmBridge {
  capturePalm(timeoutMs: number): Promise<{
    irFeature: string;
    rgbFeature?: string;
    score: number;
    palmType: 0 | 1;
  }>;
  setLedMode?(mode: "green" | "red" | "blue_breath"): void;
}

declare global {
  interface Window {
    MiliPayPalmBridge?: PalmBridge;
  }
}

export function isScannerAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.MiliPayPalmBridge?.capturePalm === "function";
}

/**
 * Simulation is opt-in per environment and never available in a production
 * build, so a misconfigured deploy cannot silently enrol fake biometrics.
 */
export function isSimulationEnabled(): boolean {
  const env = import.meta.env;
  return env.DEV === true && env.VITE_ALLOW_BIOMETRIC_SIMULATION === "true";
}

export function isSimulatedTemplate(template?: string | null): boolean {
  if (!template) return false;
  // Legacy prefix from before simulated captures were marked.
  return template.startsWith(SIMULATED_TEMPLATE_PREFIX) || template.startsWith("PVT-mock-hash-");
}

export class PalmCaptureError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "PalmCaptureError";
    this.code = code;
  }
}

/** Human-readable guidance for the SDK's real-time hints. */
export const CAPTURE_HINTS: Record<string, string> = {
  NO_PALM_DETECTED: "Place your palm 10-15cm above the scanner.",
  BIG_POSE: "Straighten your palm over the sensor.",
  QUALITY_ERROR: "Capture unclear — hold still and try again.",
  LIVENESS_ERROR: "Liveness check failed. Use a real palm.",
  IR_DARKNESS: "Move your palm closer to the scanner.",
  IR_OVER_EXPOSE: "Move your palm further from the scanner.",
  PALM_IS_MOVING: "Keep your palm still.",
};

export async function capturePalmTemplate(timeoutMs = 10_000): Promise<PalmCapture> {
  const bridge = typeof window !== "undefined" ? window.MiliPayPalmBridge : undefined;

  if (bridge?.capturePalm) {
    bridge.setLedMode?.("blue_breath");
    try {
      const frame = await bridge.capturePalm(timeoutMs);
      if (!frame?.irFeature) {
        throw new PalmCaptureError("Scanner returned no template.", "EMPTY_CAPTURE");
      }
      bridge.setLedMode?.("green");
      return {
        template: frame.irFeature,
        score: frame.score,
        palmType: frame.palmType,
        simulated: false,
      };
    } catch (err) {
      bridge.setLedMode?.("red");
      if (err instanceof PalmCaptureError) throw err;
      const hint = err instanceof Error ? CAPTURE_HINTS[err.message] : undefined;
      throw new PalmCaptureError(hint ?? "Palm capture failed. Please try again.", "CAPTURE_FAILED");
    }
  }

  if (isSimulationEnabled()) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const nonce = crypto.randomUUID();
    return {
      template: `${SIMULATED_TEMPLATE_PREFIX}${nonce}`,
      score: 0.95,
      palmType: 1,
      simulated: true,
    };
  }

  throw new PalmCaptureError(
    "No palm scanner detected. Connect an HFSecurity scanner to enrol this customer.",
    "SCANNER_UNAVAILABLE",
  );
}
