import { isRunningInExpoGo } from 'expo';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { supabase } from './supabase';
import { colors } from '../theme/tokens';

/**
 * Transaction alerts.
 *
 * Written against the SDK 57 reference: the handler returns shouldShowBanner /
 * shouldShowList rather than the older shouldShowAlert, getExpoPushTokenAsync
 * needs a projectId, and on Android 13+ the channel has to exist before the
 * token request or the permission prompt never appears.
 *
 * ─── WHY expo-notifications IS NOT IMPORTED AT THE TOP OF THIS FILE ───
 *
 * Because on Android in Expo Go, importing it CRASHES THE WHOLE APP before it
 * renders a single pixel.
 *
 * expo-notifications/index.js re-exports DevicePushTokenAutoRegistration.fx,
 * and that module calls addPushTokenListener() at module scope. Since SDK 53
 * that call runs warnOfExpoGoPushUsage(), which does not warn on Android — it
 * `throw`s. So the failure happens during the require chain, which is why no
 * amount of guarding inside the functions below would have helped, and why the
 * error arrives as a red screen at startup rather than when push is used.
 *
 * So the module is required LAZILY and only where push can actually work. In
 * Expo Go on Android every function here degrades to a no-op with a reason the
 * UI can show, which keeps the rest of the app — sign-in, purchases, the whole
 * sandbox flow — testable in Expo Go without a development build.
 *
 * Push itself still requires a development build. That is Expo's constraint,
 * not ours, and no code here can lift it.
 */

type NotificationsModule = typeof import('expo-notifications');

/** Android in Expo Go: importing the module at all would throw. */
export const PUSH_BLOCKED_BY_EXPO_GO = isRunningInExpoGo() && Platform.OS === 'android';

let cached: NotificationsModule | null = null;
let handlerInstalled = false;

/**
 * The module, or null when loading it is unsafe.
 *
 * Every caller must handle null. Returning null rather than throwing is
 * deliberate: a missing banner is not a reason to break a payment screen.
 */
function loadNotifications(): NotificationsModule | null {
  if (PUSH_BLOCKED_BY_EXPO_GO) return null;
  if (cached) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    cached = require('expo-notifications') as NotificationsModule;
  } catch (err) {
    console.warn('[notifications] module unavailable', err);
    return null;
  }

  if (!handlerInstalled) {
    handlerInstalled = true;
    /**
     * How a notification behaves while the app is open.
     *
     * Deliberately silent and badge-free in the foreground: the customer is
     * already looking at the app, and the purchase screen shows live progress
     * of its own. A banner is enough.
     */
    cached.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  }

  return cached;
}

export const TRANSACTION_CHANNEL_ID = 'transactions';

/** Android needs a channel, and needs it before the token is requested. */
async function ensureAndroidChannel(api: NotificationsModule): Promise<void> {
  if (Platform.OS !== 'android') return;
  await api.setNotificationChannelAsync(TRANSACTION_CHANNEL_ID, {
    name: 'Payments',
    description: 'Tells you when a payment is confirmed, delivered, or has failed.',
    importance: api.AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 100, 200],
    lightColor: colors.signal.base,
  });
}

export type RegisterResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'expo-go' | 'simulator' | 'denied' | 'no-project-id' | 'error' };

/**
 * Ask for permission, get this device's push token, and record it.
 *
 * Never throws: a customer who declines notifications, a build without a
 * project id, or Expo Go must all still get a working app. The caller decides
 * whether the refusal is worth mentioning.
 */
export async function registerForPushNotifications(): Promise<RegisterResult> {
  try {
    const api = loadNotifications();
    if (!api) return { ok: false, reason: 'expo-go' };

    // A simulator has no push token to give. Asking produces an error, not a
    // decline, so there is nothing to recover from.
    if (!Device.isDevice) return { ok: false, reason: 'simulator' };

    await ensureAndroidChannel(api);

    const existing = await api.getPermissionsAsync();
    let granted =
      existing.granted || existing.ios?.status === api.IosAuthorizationStatus.PROVISIONAL;

    if (!granted && existing.canAskAgain) {
      const asked = await api.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      });
      granted = asked.granted || asked.ios?.status === api.IosAuthorizationStatus.PROVISIONAL;
    }

    if (!granted) return { ok: false, reason: 'denied' };

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as any).easConfig?.projectId;
    if (!projectId) return { ok: false, reason: 'no-project-id' };

    const { data: token } = await api.getExpoPushTokenAsync({ projectId });
    if (!token) return { ok: false, reason: 'error' };

    await saveToken(token);
    return { ok: true, token };
  } catch (err) {
    console.warn('[notifications] could not register', err);
    return { ok: false, reason: 'error' };
  }
}

/**
 * Store the token against the signed-in user.
 *
 * Upsert on the token, because Expo issues one per installation: the same
 * device signing in again must update its row rather than accumulate rows, and
 * a device that was revoked and has come back must clear its revocation.
 */
async function saveToken(token: string): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return;

  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('auth_user_id', userId)
    .maybeSingle();

  const { error } = await supabase.from('push_tokens').upsert(
    {
      user_id: userId,
      customer_id: customer?.id ?? null,
      token,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      device_name: Device.deviceName ?? null,
      last_seen_at: new Date().toISOString(),
      revoked_at: null,
    },
    { onConflict: 'token' },
  );

  if (error) console.warn('[notifications] could not save token', error.message);
}

/**
 * Stop sending to this device.
 *
 * Called on sign-out: the next person to use the handset should not receive
 * the previous customer's payment alerts.
 */
export async function revokeThisDevice(): Promise<void> {
  try {
    const api = loadNotifications();
    if (!api || !Device.isDevice) return;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as any).easConfig?.projectId;
    if (!projectId) return;

    const { data: token } = await api.getExpoPushTokenAsync({ projectId });
    if (!token) return;

    await supabase
      .from('push_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token', token);
  } catch (err) {
    console.warn('[notifications] could not revoke token', err);
  }
}

export interface NotificationRouting {
  /** Open a transaction the notification refers to. */
  onTransaction: (reference: string) => void;
}

/**
 * Wire up what happens when a notification is tapped.
 *
 * Returns a cleanup function. In Expo Go it returns a no-op, so callers do not
 * need to know whether push is available.
 */
export function attachNotificationListeners(routing: NotificationRouting): () => void {
  const api = loadNotifications();
  if (!api) return () => {};

  const tapped = api.addNotificationResponseReceivedListener((response) => {
    const reference = response.notification.request.content.data?.reference;
    if (typeof reference === 'string' && reference.length > 0) {
      routing.onTransaction(reference);
    }
  });

  return () => {
    tapped.remove();
  };
}

/**
 * Whether the customer has notifications turned on, for the Settings row.
 * Reflects the operating system, which is the only thing that decides this —
 * a switch in the app that disagreed with the system setting would be a lie.
 */
export async function notificationsEnabled(): Promise<boolean> {
  try {
    const api = loadNotifications();
    if (!api) return false;
    const perms = await api.getPermissionsAsync();
    return perms.granted || perms.ios?.status === api.IosAuthorizationStatus.PROVISIONAL;
  } catch {
    return false;
  }
}
