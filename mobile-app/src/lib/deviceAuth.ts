/**
 * Device biometric unlock (fingerprint / Face ID), with the MiliPay PIN as the
 * fallback.
 *
 * API surface follows the Expo SDK 57 reference:
 * https://docs.expo.dev/versions/v57.0.0/sdk/local-authentication/
 *
 * Two deliberate choices:
 *
 *   - `disableDeviceFallback: true`. When the fingerprint fails we want *our*
 *     PIN, verified against the server, not the handset's screen-lock passcode.
 *     A device passcode proves the phone is unlocked; it does not prove the
 *     person is the MiliPay customer.
 *   - `biometricsSecurityLevel: 'strong'` on Android, so a Class 2 sensor that
 *     the platform considers spoofable is not accepted for a financial action.
 *
 * The enrolment flag lives in SecureStore (Keychain / Keystore), scoped to this
 * install. It is a preference, not a credential: the authority for "is this the
 * customer" is the OS biometric prompt or the server-side PIN check.
 */
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const ENROLLED_KEY = 'milipay.biometric.enabled';

export type DeviceAuthOutcome =
  | 'success'
  /** No sensor, nothing enrolled on the device, or the user turned it off. */
  | 'unavailable'
  /** The user dismissed the prompt. */
  | 'cancelled'
  /** The sensor ran and said no. */
  | 'failed';

export interface BiometricCapability {
  hasHardware: boolean;
  isEnrolled: boolean;
  /** What the prompt will show, for user-facing copy. */
  label: 'Fingerprint' | 'Face ID' | 'Iris' | 'Biometrics';
}

export async function getBiometricCapability(): Promise<BiometricCapability> {
  try {
    const [hasHardware, isEnrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);

    let label: BiometricCapability['label'] = 'Biometrics';
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      label = 'Fingerprint';
    } else if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      label = 'Face ID';
    } else if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      label = 'Iris';
    }

    return { hasHardware, isEnrolled, label };
  } catch {
    return { hasHardware: false, isEnrolled: false, label: 'Biometrics' };
  }
}

export async function isBiometricUnlockEnabled(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(ENROLLED_KEY)) === 'true';
  } catch {
    return false;
  }
}

export async function setBiometricUnlockEnabled(enabled: boolean): Promise<void> {
  try {
    if (enabled) {
      await SecureStore.setItemAsync(ENROLLED_KEY, 'true');
    } else {
      await SecureStore.deleteItemAsync(ENROLLED_KEY);
    }
  } catch (err) {
    console.warn('Could not persist biometric preference:', err);
  }
}

/**
 * Show the OS biometric prompt.
 *
 * Returns 'unavailable' rather than throwing when there is no sensor, so the
 * caller can fall through to the PIN without special-casing errors.
 */
export async function promptBiometric(reason: string): Promise<DeviceAuthOutcome> {
  const { hasHardware, isEnrolled } = await getBiometricCapability();
  if (!hasHardware || !isEnrolled) return 'unavailable';

  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      cancelLabel: 'Use PIN instead',
      // Fall back to the MiliPay PIN, not the device passcode.
      disableDeviceFallback: true,
      biometricsSecurityLevel: 'strong',
      requireConfirmation: false,
    });

    if (result.success) return 'success';

    const error = 'error' in result ? result.error : '';
    if (error === 'user_cancel' || error === 'system_cancel' || error === 'app_cancel') {
      return 'cancelled';
    }
    if (
      error === 'not_available' ||
      error === 'not_enrolled' ||
      error === 'passcode_not_set' ||
      error === 'unknown'
    ) {
      return 'unavailable';
    }
    return 'failed';
  } catch (err) {
    console.warn('Biometric prompt error:', err);
    return 'unavailable';
  }
}

/**
 * Enrol biometric unlock: prove it works once, then remember the preference.
 * Returns false if the customer could not (or would not) complete the prompt.
 */
export async function enrolBiometricUnlock(reason: string): Promise<boolean> {
  const outcome = await promptBiometric(reason);
  if (outcome !== 'success') return false;
  await setBiometricUnlockEnabled(true);
  return true;
}
