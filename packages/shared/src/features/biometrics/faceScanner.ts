/**
 * Facial capture.
 *
 * Deliberately built to the same contract as palmScanner.ts: a real capture
 * comes from the enrolment device's SDK through a native bridge injected into
 * the webview; a desktop browser with no camera either simulates loudly or
 * refuses outright.
 *
 * The HFSecurity enrolment units (HF-FP08PV / VP930Pro) carry a binocular
 * camera alongside the palm sensor, so this is the same hardware the agent is
 * already holding — it is a second bridge method, not a second device.
 */

/** Marker prefix carried by every simulated template so it is identifiable downstream. */
export const SIMULATED_FACE_PREFIX = "SIMULATED-FACE-";

export interface FaceCapture {
  /** Base64 feature template, or a marked simulated value. */
  template: string;
  /** SDK quality score, 0..1. */
  score: number;
  /** True when the SDK confirmed a live subject rather than a photograph. */
  liveness: boolean;
  simulated: boolean;
}

/** Native bridge contract implemented by FaceScannerModule in the Android shell. */
interface FaceBridge {
  captureFace(timeoutMs: number): Promise<{
    feature: string;
    score: number;
    liveness: boolean;
  }>;
}

declare global {
  interface Window {
    MiliPayFaceBridge?: FaceBridge;
  }
}

export function isFaceScannerAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.MiliPayFaceBridge?.captureFace === "function";
}

/**
 * Simulation is opt-in per environment and never available in a production
 * build, so a misconfigured deploy cannot silently enrol a face that does not
 * exist. Shares the palm scanner's flag: an enrolment station either has the
 * hardware or it does not.
 */
export function isFaceSimulationEnabled(): boolean {
  const env = import.meta.env;
  return env.DEV === true && env.VITE_ALLOW_BIOMETRIC_SIMULATION === "true";
}

export function isSimulatedFaceTemplate(template?: string | null): boolean {
  return Boolean(template) && template!.startsWith(SIMULATED_FACE_PREFIX);
}

export class FaceCaptureError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "FaceCaptureError";
    this.code = code;
  }
}

/** Human-readable guidance for the SDK's real-time hints. */
export const FACE_CAPTURE_HINTS: Record<string, string> = {
  NO_FACE_DETECTED: "Look straight at the camera.",
  MULTIPLE_FACES: "Only the customer should be in frame.",
  FACE_TOO_SMALL: "Move closer to the camera.",
  FACE_TOO_LARGE: "Move back from the camera.",
  BIG_POSE: "Face the camera squarely — do not tilt your head.",
  QUALITY_ERROR: "Capture unclear — hold still and try again.",
  LIVENESS_ERROR: "Liveness check failed. A photograph cannot be enrolled.",
  TOO_DARK: "Move somewhere better lit.",
  EYES_CLOSED: "Keep your eyes open.",
};

export async function captureFaceTemplate(timeoutMs = 10_000): Promise<FaceCapture> {
  const bridge = typeof window !== "undefined" ? window.MiliPayFaceBridge : undefined;

  if (bridge?.captureFace) {
    try {
      const frame = await bridge.captureFace(timeoutMs);
      if (!frame?.feature) {
        throw new FaceCaptureError("Camera returned no template.", "EMPTY_CAPTURE");
      }
      if (!frame.liveness) {
        throw new FaceCaptureError(
          FACE_CAPTURE_HINTS.LIVENESS_ERROR,
          "LIVENESS_FAILED",
        );
      }
      return {
        template: frame.feature,
        score: frame.score,
        liveness: true,
        simulated: false,
      };
    } catch (err) {
      if (err instanceof FaceCaptureError) throw err;
      const hint = err instanceof Error ? FACE_CAPTURE_HINTS[err.message] : undefined;
      throw new FaceCaptureError(hint ?? "Facial capture failed. Please try again.", "CAPTURE_FAILED");
    }
  }

  if (isFaceSimulationEnabled()) {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    return {
      template: `${SIMULATED_FACE_PREFIX}${crypto.randomUUID()}`,
      score: 0.94,
      liveness: true,
      simulated: true,
    };
  }

  throw new FaceCaptureError(
    "No camera detected. Use an HFSecurity enrolment device to capture this customer's face.",
    "CAMERA_UNAVAILABLE",
  );
}
