import type { SmileSession } from './signupClient';

/**
 * Smile ID's selfie capture (Biometric KYC: liveness and a match with the
 * NIMC photo). The camera screen is Smile ID's own SDK and is not designed by
 * us (design handoff, step 3).
 *
 * The SDK (`@smileid/usesmileid`) has native code, so it runs only in a
 * development or release build of the app, never in Expo Go, and it is added
 * once Smile ID keys exist. Until then this reports that selfie checks are not
 * available, and sign-up stops honestly at the selfie step rather than
 * pretending a check happened.
 *
 * When the SDK is installed, `registerSelfieCapture` is given a function that
 * mounts its Biometric KYC flow with the session's token and ID info and
 * resolves with the job id Smile ID issued.
 */

export type SelfieCaptureResult =
  | { kind: 'submitted'; jobId: string }
  | { kind: 'cancelled' }
  | { kind: 'failed'; message: string };

type Capture = (session: SmileSession) => Promise<SelfieCaptureResult>;

let capture: Capture | null = null;

export function registerSelfieCapture(fn: Capture | null) {
  capture = fn;
}

export function selfieCaptureAvailable(): boolean {
  return capture !== null;
}

export async function captureSelfie(session: SmileSession): Promise<SelfieCaptureResult> {
  if (!capture) {
    return { kind: 'failed', message: "Selfie checks aren't switched on in this version of the app yet." };
  }
  return capture(session);
}
