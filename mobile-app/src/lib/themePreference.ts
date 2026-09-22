import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The customer's chosen appearance, remembered between launches.
 *
 * The Settings screen held this in useState and handed it to NativeWind's
 * setColorScheme, neither of which survives the app closing — so somebody who
 * chose Dark found it back on System the next morning, and the Settings row
 * said "System" while the app was still showing what they picked.
 */
export type ThemePreference = 'system' | 'light' | 'dark';

const KEY = 'milipay.theme';

export async function loadThemePreference(): Promise<ThemePreference> {
  try {
    const stored = await AsyncStorage.getItem(KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // A device that will not give us storage is not a reason to fail to start.
  }
  return 'system';
}

export async function saveThemePreference(value: ThemePreference): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, value);
  } catch {
    // Same: the choice still applies for this session.
  }
}
