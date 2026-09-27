import AsyncStorage from '@react-native-async-storage/async-storage';
import { Contact } from 'expo-contacts';
import { normaliseLocalPhone } from './purchaseForm';

/**
 * The numbers under the phone field (the design's "My number · Mum · Chidi").
 *
 * Kept on this phone only — they are the customer's own address book, not
 * something MiliPay needs to hold. "My number" is always first and comes from
 * the profile; the rest are people picked from contacts, most recent first.
 */
export interface SavedNumber {
  label: string;
  phone: string;
}

const KEY = 'milipay.savedNumbers';
const MAX_SAVED = 5;

export async function loadSavedNumbers(): Promise<SavedNumber[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((n) => typeof n?.label === 'string' && typeof n?.phone === 'string')
      : [];
  } catch {
    return [];
  }
}

export async function rememberNumber(entry: SavedNumber): Promise<SavedNumber[]> {
  const current = await loadSavedNumbers();
  const next = [entry, ...current.filter((n) => n.phone !== entry.phone)].slice(0, MAX_SAVED);
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Still usable for this session.
  }
  return next;
}

/** "My number" first, then the saved ones, without repeats. */
export function withMyNumber(saved: SavedNumber[], myPhone: string | null | undefined): SavedNumber[] {
  const mine = normaliseLocalPhone(myPhone ?? '');
  const head = mine.length === 11 ? [{ label: 'My number', phone: mine }] : [];
  return [...head, ...saved.filter((n) => n.phone !== mine)];
}

export type PickResult =
  | { ok: true; entry: SavedNumber }
  | { ok: false; reason: 'cancelled' | 'no-number' | 'unavailable' };

/**
 * Opens the phone's own contact picker (expo-contacts SDK 57
 * `Contact.presentPicker`) and returns the chosen person's first mobile
 * number in local 11-digit form. MiliPay reads only the one contact picked.
 */
export async function pickContactNumber(): Promise<PickResult> {
  try {
    const contact = await Contact.presentPicker();
    if (!contact) return { ok: false, reason: 'cancelled' };
    const [phones, name] = await Promise.all([contact.getPhones(), contact.getFullName().catch(() => '')]);
    const number = phones
      .map((p) => normaliseLocalPhone(p.number ?? ''))
      .find((n) => /^0[789][01]\d{8}$/.test(n));
    if (!number) return { ok: false, reason: 'no-number' };
    const label = (name || '').trim().split(/\s+/)[0] || number;
    return { ok: true, entry: { label, phone: number } };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}
