/**
 * Palm-vein capture (HFSecurity VP930 / VP930Pro).
 *
 * Real captures come from the HFSecurity SDK through a native bridge that the
 * rugged Android shell injects into the webview, or — on a Windows agent kit —
 * from a small local daemon wrapping the C++ SDK behind the same contract. In a
 * plain desktop browser there is no scanner, so capture is either simulated —
 * loudly, and only when explicitly enabled — or refused.
 *
 * Two things in here look like duplication and are not:
 *
 *   registerPalm()         calls the SDK's RegisterPalm, which applies strict
 *                          quality gates and emits the model-switching hashes.
 *                          Enrolment only.
 *   extractPalmFeatures()  calls ExtractPalmFeaturesFromImg, which is looser
 *                          and returns features alone. Verification only.
 *
 * Enrolling through the verification path would bank a marginal template and
 * quietly raise that customer's false-reject rate for the life of the account,
 * so the two are separate functions rather than one with a flag.
 *
 * Feature vectors cross this boundary as base64 of a packed little-endian
 * float32 array. The desktop SDK produces std::vector<float> and Android
 * produces byte[]; the bridge normalises, so a palm enrolled on a Windows kit
 * in Lagos matches on an Android terminal in Sokoto.
 */

/** Marker prefix carried by every simulated template so it is identifiable downstream. */
export const SIMULATED_TEMPLATE_PREFIX = "SIMULATED-PVT-";

/**
 * StreamPalm::RecognizeMode. kBiModal compares IR *and* RGB and is the SDK's
 * own default for registration; it is also the only mode that uses the colour
 * liveness signal, so it is ours too.
 */
export type PalmRecognizeMode =
  | "kRegIrVSIr"
  | "kRegIrVSRgb"
  | "kRegRgbVSIr"
  | "kRegRgbVSRgb"
  | "kBiModal";

export const DEFAULT_RECOGNIZE_MODE: PalmRecognizeMode = "kBiModal";

/**
 * LED states and the vendor's own SetLedMode values, from "Definition Table of
 * Light Effect for Palm Brushing Module". At a merchant counter this lamp is
 * the only feedback the customer gets, so the mapping is the vendor's, not
 * ours.
 */
export const PALM_LED_MODES = {
  standby: 3, // weak blue
  working: 15, // blue breathing
  recognising: 20, // combined palm-recognition effect
  deviceError: 1, // red steady
  failed: 4, // yellow steady
  tooClose: 10, // yellow flashing
  inProgress: 11, // purple flashing
  success: 5, // purple steady
  off: 0,
} as const;

export type PalmLedState = keyof typeof PALM_LED_MODES;

/**
 * PalmDetectResult / the Android Hint enum, complete. Previously only seven of
 * these were handled and everything else fell through to "please try again",
 * which told an agent nothing about why a capture kept failing.
 *
 * `register` marks the codes that only fire during RegisterPalm — they carry
 * the stricter enrolment thresholds.
 */
export interface CaptureHint {
  code: number;
  enum: string;
  message: string;
  register: boolean;
  /** Liveness and reliability failures are anti-spoof signals, not retry noise. */
  security?: boolean;
}

export const CAPTURE_RESULTS: readonly CaptureHint[] = [
  { code: 0, enum: "SUCCESS", message: "Palm captured.", register: false },
  { code: 1, enum: "BIG_POSE", message: "Straighten your palm over the scanner.", register: false },
  { code: 2, enum: "QUALITY_ERROR", message: "Face your palm towards the scanner.", register: false },
  { code: 3, enum: "REGISTER_QUALITY_ERROR", message: "Open and straighten your palm.", register: true },
  { code: 4, enum: "LIVENESS_ERROR", message: "Liveness check failed. Use a real palm.", register: false, security: true },
  { code: 6, enum: "IR_DARKNESS", message: "Move your palm slightly closer.", register: false },
  { code: 7, enum: "IR_OVER_EXPOSE", message: "Move your palm slightly further away.", register: false },
  { code: 8, enum: "RGB_DARKNESS", message: "Move your palm slightly closer.", register: false },
  { code: 9, enum: "RGB_OVER_EXPOSE", message: "Move your palm slightly further away.", register: false },
  { code: 10, enum: "REGISTER_IR_DARKNESS", message: "Move your palm slightly closer.", register: true },
  { code: 11, enum: "REGISTER_IR_OVER_EXPOSE", message: "Move your palm slightly further away.", register: true },
  { code: 12, enum: "REGISTER_RGB_DARKNESS", message: "Move your palm slightly closer.", register: true },
  { code: 13, enum: "REGISTER_RGB_OVER_EXPOSE", message: "Move your palm slightly further away.", register: true },
  { code: 14, enum: "LIVENESS_COLOR_GRAY_ERROR", message: "Liveness check failed. Face your palm towards the scanner.", register: false, security: true },
  { code: 15, enum: "RELIABILITY_IR_ERROR", message: "Make sure the palm is clean, dry and unobstructed.", register: false, security: true },
  { code: 16, enum: "RELIABILITY_RGB_ERROR", message: "Make sure the palm is clean, dry and unobstructed.", register: false, security: true },
  { code: 17, enum: "REGISTER_RELIABILITY_IR_ERROR", message: "Make sure the palm is clean, dry and unobstructed.", register: true, security: true },
  { code: 18, enum: "REGISTER_RELIABILITY_RGB_ERROR", message: "Make sure the palm is clean, dry and unobstructed.", register: true, security: true },
  { code: 23, enum: "UNEXPECTED_CENTER_BOX_POS", message: "Centre your palm over the scanner.", register: false },
  { code: 24, enum: "ILLEGAL_ENV", message: "Too much ambient light. Move away from direct sunlight.", register: false },
  { code: 25, enum: "PALM_IS_MOVING", message: "Hold your palm still.", register: false },
  { code: 0x4000, enum: "MANUAL_STOP", message: "Capture cancelled.", register: false },
  { code: 0x8000, enum: "TIMEOUT", message: "Capture timed out. Try again.", register: false },
  { code: 0x8888, enum: "INITIALIZING", message: "Scanner is starting up — try again in a moment.", register: false },
] as const;

const RESULTS_BY_CODE = new Map(CAPTURE_RESULTS.map((r) => [r.code, r]));
const RESULTS_BY_ENUM = new Map(CAPTURE_RESULTS.map((r) => [r.enum, r]));

export function describeCaptureResult(result: number | string | undefined | null): CaptureHint | undefined {
  if (result === undefined || result === null) return undefined;
  return typeof result === "number" ? RESULTS_BY_CODE.get(result) : RESULTS_BY_ENUM.get(result);
}

/** True when the failure is an anti-spoof signal that an operator should see. */
export function isSecurityRelevantResult(result: number | string | undefined | null): boolean {
  return describeCaptureResult(result)?.security === true;
}

/** Everything RegisterPalm yields, carried through to the server unchanged. */
export interface PalmEnrolment {
  /** base64 of packed little-endian float32. */
  irFeatures: string | null;
  rgbFeatures: string | null;
  skeleton: string | null;
  hashIr: string | null;
  hashRgb: string | null;
  /**
   * Raw SDK palm_type. The vendor's own headers document 0/1 as left/right in
   * three places and right/left in a fourth, so this is stored and compared
   * like-for-like but never labelled in the UI.
   */
  palmType: 0 | 1;
  recogMode: PalmRecognizeMode;
  algorithmVersion: string;
  featureDim: number | null;
  qualityScore: number;
  captureResult: number;
  simulated: boolean;
  /**
   * Legacy single-string template, kept so customers.palm_vein_template keeps
   * working through the cutover. Drop once palm_templates is authoritative.
   */
  template: string;
}

/** What verification returns — no hashes, no boxes, no quality gate. */
export interface PalmVerification {
  irFeatures: string | null;
  rgbFeatures: string | null;
  palmType: 0 | 1;
  recogMode: PalmRecognizeMode;
  algorithmVersion: string;
  qualityScore: number;
  captureResult: number;
  simulated: boolean;
}

interface BridgeFeatures {
  irFeatures?: string | null;
  rgbFeatures?: string | null;
  skeleton?: string | null;
  hashIr?: string | null;
  hashRgb?: string | null;
  palmType?: 0 | 1;
  recogMode?: PalmRecognizeMode;
  algorithmVersion?: string;
  featureDim?: number | null;
  score?: number;
  result?: number;
  /** Pre-v2 bridges returned only this. */
  irFeature?: string;
  rgbFeature?: string;
}

/**
 * Native bridge contract implemented by PalmScannerModule in the Android shell
 * and by the Windows agent-kit daemon.
 *
 * registerPalm/extractPalmFeatures are the v2 surface. capturePalm is the v1
 * one, still accepted so an un-updated shell keeps enrolling rather than
 * failing outright — see callBridge().
 */
interface PalmBridge {
  registerPalm?(opts: { timeoutMs: number; recogMode: PalmRecognizeMode }): Promise<BridgeFeatures>;
  extractPalmFeatures?(opts: { timeoutMs: number; recogMode: PalmRecognizeMode }): Promise<BridgeFeatures>;
  capturePalm?(timeoutMs: number): Promise<BridgeFeatures>;
  setLedMode?(mode: PalmLedState | string, value?: number): void;
  onHint?(cb: (result: number) => void): void;
  /** SDK GetRecognitionThreshold — the SDK's number, not one we invented. */
  getRecognitionThreshold?(mode: PalmRecognizeMode): Promise<{ ir: number; rgb: number }>;
}

declare global {
  interface Window {
    MiliPayPalmBridge?: PalmBridge;
  }
}

function bridge(): PalmBridge | undefined {
  return typeof window !== "undefined" ? window.MiliPayPalmBridge : undefined;
}

export function isScannerAvailable(): boolean {
  const b = bridge();
  return typeof b?.registerPalm === "function" || typeof b?.capturePalm === "function";
}

/** True when the attached bridge implements the register/verify split. */
export function supportsRegisterVerifySplit(): boolean {
  const b = bridge();
  return typeof b?.registerPalm === "function" && typeof b?.extractPalmFeatures === "function";
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
  /** PalmDetectResult, when the SDK gave one. */
  result?: number;

  constructor(message: string, code: string, result?: number) {
    super(message);
    this.name = "PalmCaptureError";
    this.code = code;
    this.result = result;
  }
}

export function setLed(state: PalmLedState): void {
  bridge()?.setLedMode?.(state, PALM_LED_MODES[state]);
}

/**
 * The SDK's own threshold for a mode. Returns null when the bridge predates
 * this call, in which case the *server* threshold applies and the client must
 * not invent one.
 */
export async function getRecognitionThreshold(
  mode: PalmRecognizeMode = DEFAULT_RECOGNIZE_MODE,
): Promise<{ ir: number; rgb: number } | null> {
  const b = bridge();
  if (typeof b?.getRecognitionThreshold !== "function") return null;
  try {
    return await b.getRecognitionThreshold(mode);
  } catch {
    return null;
  }
}

function normaliseFeatures(raw: BridgeFeatures): {
  ir: string | null;
  rgb: string | null;
} {
  return {
    ir: raw.irFeatures ?? raw.irFeature ?? null,
    rgb: raw.rgbFeatures ?? raw.rgbFeature ?? null,
  };
}

async function callBridge(
  kind: "register" | "verify",
  timeoutMs: number,
  recogMode: PalmRecognizeMode,
): Promise<BridgeFeatures> {
  const b = bridge();
  if (!b) throw new PalmCaptureError("No scanner bridge.", "SCANNER_UNAVAILABLE");

  if (kind === "register" && typeof b.registerPalm === "function") {
    return b.registerPalm({ timeoutMs, recogMode });
  }
  if (kind === "verify" && typeof b.extractPalmFeatures === "function") {
    return b.extractPalmFeatures({ timeoutMs, recogMode });
  }
  if (typeof b.capturePalm === "function") {
    // v1 bridge. It only implements the capture path, which is the *looser*
    // one, so enrolling through it produces a weaker template than
    // RegisterPalm would. Acceptable while shells are being updated; the
    // server records recog_mode and can find these rows later.
    return b.capturePalm(timeoutMs);
  }
  throw new PalmCaptureError("Scanner bridge is missing the required call.", "BRIDGE_INCOMPATIBLE");
}

function failureFor(err: unknown): PalmCaptureError {
  if (err instanceof PalmCaptureError) return err;
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const hint = describeCaptureResult(raw) ?? describeCaptureResult(Number(raw));
  return new PalmCaptureError(
    hint?.message ?? "Palm capture failed. Please try again.",
    hint?.enum ?? "CAPTURE_FAILED",
    hint?.code,
  );
}

/**
 * Enrolment capture. Uses the SDK's strict RegisterPalm path.
 */
export async function registerPalm(
  opts: { timeoutMs?: number; recogMode?: PalmRecognizeMode } = {},
): Promise<PalmEnrolment> {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const recogMode = opts.recogMode ?? DEFAULT_RECOGNIZE_MODE;

  if (isScannerAvailable()) {
    setLed("working");
    try {
      const raw = await callBridge("register", timeoutMs, recogMode);
      const { ir, rgb } = normaliseFeatures(raw);

      if (!ir && !rgb) {
        throw new PalmCaptureError("Scanner returned no template.", "EMPTY_CAPTURE");
      }

      const result = raw.result ?? 0;
      if (result !== 0) {
        const hint = describeCaptureResult(result);
        throw new PalmCaptureError(
          hint?.message ?? "Palm registration failed. Please try again.",
          hint?.enum ?? "REGISTER_FAILED",
          result,
        );
      }

      // kBiModal compares both modalities; without RGB the template can never
      // match in the mode it claims. Fail here rather than store it.
      if (recogMode === "kBiModal" && !rgb) {
        throw new PalmCaptureError(
          "Scanner returned no colour capture, which bimodal enrolment requires.",
          "MISSING_RGB_FEATURES",
        );
      }

      setLed("success");
      return {
        irFeatures: ir,
        rgbFeatures: rgb,
        skeleton: raw.skeleton ?? null,
        hashIr: raw.hashIr ?? null,
        hashRgb: raw.hashRgb ?? null,
        palmType: raw.palmType ?? 1,
        recogMode: raw.recogMode ?? recogMode,
        algorithmVersion: raw.algorithmVersion ?? "unknown",
        featureDim: raw.featureDim ?? null,
        qualityScore: raw.score ?? 0,
        captureResult: result,
        simulated: false,
        template: ir ?? rgb ?? "",
      };
    } catch (err) {
      setLed("failed");
      throw failureFor(err);
    }
  }

  if (isSimulationEnabled()) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const nonce = crypto.randomUUID();
    const marker = `${SIMULATED_TEMPLATE_PREFIX}${nonce}`;
    return {
      irFeatures: marker,
      rgbFeatures: `${marker}-rgb`,
      skeleton: null,
      hashIr: null,
      hashRgb: null,
      palmType: 1,
      recogMode,
      algorithmVersion: "simulated",
      featureDim: null,
      qualityScore: 0.95,
      captureResult: 0,
      simulated: true,
      template: marker,
    };
  }

  throw new PalmCaptureError(
    "No palm scanner detected. Connect an HFSecurity scanner to enrol this customer.",
    "SCANNER_UNAVAILABLE",
  );
}

/**
 * Verification capture. Looser gates, no hashes — never use this to enrol.
 */
export async function extractPalmFeatures(
  opts: { timeoutMs?: number; recogMode?: PalmRecognizeMode } = {},
): Promise<PalmVerification> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const recogMode = opts.recogMode ?? DEFAULT_RECOGNIZE_MODE;

  if (!isScannerAvailable()) {
    if (isSimulationEnabled()) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      const marker = `${SIMULATED_TEMPLATE_PREFIX}${crypto.randomUUID()}`;
      return {
        irFeatures: marker,
        rgbFeatures: `${marker}-rgb`,
        palmType: 1,
        recogMode,
        algorithmVersion: "simulated",
        qualityScore: 0.93,
        captureResult: 0,
        simulated: true,
      };
    }
    throw new PalmCaptureError(
      "No palm scanner detected.",
      "SCANNER_UNAVAILABLE",
    );
  }

  setLed("inProgress");
  try {
    const raw = await callBridge("verify", timeoutMs, recogMode);
    const { ir, rgb } = normaliseFeatures(raw);

    if (!ir && !rgb) {
      throw new PalmCaptureError("Scanner returned no features.", "EMPTY_CAPTURE");
    }

    const result = raw.result ?? 0;
    if (result !== 0) {
      const hint = describeCaptureResult(result);
      throw new PalmCaptureError(
        hint?.message ?? "Palm scan failed. Please try again.",
        hint?.enum ?? "CAPTURE_FAILED",
        result,
      );
    }

    setLed("success");
    return {
      irFeatures: ir,
      rgbFeatures: rgb,
      palmType: raw.palmType ?? 1,
      recogMode: raw.recogMode ?? recogMode,
      algorithmVersion: raw.algorithmVersion ?? "unknown",
      qualityScore: raw.score ?? 0,
      captureResult: result,
      simulated: false,
    };
  } catch (err) {
    setLed("failed");
    throw failureFor(err);
  }
}

/**
 * @deprecated Use registerPalm() for enrolment or extractPalmFeatures() for
 * verification. Kept so existing callers keep compiling through the cutover.
 */
export async function capturePalmTemplate(
  timeoutMs = 10_000,
): Promise<{ template: string; score: number; palmType: 0 | 1; simulated: boolean }> {
  const enrolment = await registerPalm({ timeoutMs });
  return {
    template: enrolment.template,
    score: enrolment.qualityScore,
    palmType: enrolment.palmType,
    simulated: enrolment.simulated,
  };
}

/**
 * @deprecated Superseded by CAPTURE_RESULTS, which is the complete table.
 */
export const CAPTURE_HINTS: Record<string, string> = Object.fromEntries(
  CAPTURE_RESULTS.filter((r) => r.code !== 0).map((r) => [r.enum, r.message]),
);
