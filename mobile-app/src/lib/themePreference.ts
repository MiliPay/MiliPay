import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The customer's chosen appearance, remembered between launches.
 *
 * The redesign opens in Light and offers exactly two choices, Light and Dark,
 * on Me › Appearance (design handoff: the prototype's `theme` starts at
 * 'light'; the HTML wins over the README's "follow the system"). It used to
 * follow the phone, so a phone in dark mode showed every screen dark against
 * a light design. A 'system' value saved by the old Settings screen now reads
 * as Light.
 */
export type ThemePreference = 'light' | 'dark';

const KEY = 'milipay.theme';

export async function loadThemePreference(): Promise<ThemePreference> {
  try {
    const stored = await AsyncStorage.getItem(KEY);
    if (stored === 'dark') return 'dark';
  } catch {
    // A device that will not give us storage is not a reason to fail to start.
  }
  return 'light';
}

export async function saveThemePreference(value: ThemePreference): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, value);
  } catch {
    // Same: the choice still applies for this session.
  }
}
