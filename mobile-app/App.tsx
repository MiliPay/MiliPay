import './global.css';
import React, { useCallback, useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DarkTheme, createNavigationContainerRef } from '@react-navigation/native';
import AppNavigator from './src/navigation/AppNavigator';

export const navigationRef = createNavigationContainerRef();
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import { AnimatedSplash } from './src/components/ds/AnimatedSplash';
import { HeartbeatFill } from './src/components/ds/HeartbeatLoader';
import { SpaceMono_400Regular, SpaceMono_700Bold } from '@expo-google-fonts/space-mono';
import * as SplashScreen from 'expo-splash-screen';
import { LogBox } from 'react-native';
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';
import { useAuthStore } from './src/store/useStore';
import { colorScheme, useColorScheme } from 'nativewind';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { loadThemePreference } from './src/lib/themePreference';
import { themeColors } from './src/theme/tokens';
import {
  attachNotificationListeners,
  registerForPushNotifications,
} from './src/lib/notifications';

configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false,
});

LogBox.ignoreLogs([
  "SafeAreaView has been deprecated and will be removed in a future release",
]);

SplashScreen.preventAutoHideAsync();

// The redesign opens in Light (the prototype's default). Set before the first
// frame, so a phone in dark mode never flashes the app dark; a saved Dark
// choice is applied as soon as it is read.
colorScheme.set('light');

/**
 * React Navigation's colours, from the redesign's tokens. The theme was the
 * old dark one with a transparent background, so a near-black backdrop showed
 * behind every pushed screen as it slid in.
 */
function navTheme(isDark: boolean) {
  const c = isDark ? themeColors.dark : themeColors.light;
  return {
    ...DarkTheme,
    dark: isDark,
    colors: {
      ...DarkTheme.colors,
      primary: c.brand,
      background: c.bg,
      card: c.bg,
      text: c.text,
      border: c.line,
      notification: c.fail,
    },
  };
}

export default function App() {
  const initializeAuth = useAuthStore((state) => state.initialize);
  const isLoading = useAuthStore((state) => state.isLoading);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const { colorScheme: scheme, setColorScheme } = useColorScheme();
  const isDark = scheme === 'dark';

  // The window behind everything (seen during transitions and keyboard
  // animations) follows the theme too.
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(isDark ? themeColors.dark.bg : themeColors.light.bg);
  }, [isDark]);
  
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    SpaceMono_400Regular,
    SpaceMono_700Bold,
  });

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  // Apply the appearance the customer last chose. Without this the Settings
  // screen could remember the choice and the app would still start on the
  // system default every time.
  useEffect(() => {
    let cancelled = false;
    loadThemePreference().then((stored) => {
      if (!cancelled) setColorScheme(stored);
    });
    return () => {
      cancelled = true;
    };
  }, [setColorScheme]);

  /**
   * Transaction alerts.
   *
   * Registration only happens once there is somebody to register: asking a
   * signed-out customer for notification permission spends the one prompt iOS
   * gives you on a person who has not yet seen what the app does. The listener
   * is attached regardless, so a notification tapped from a cold start still
   * lands on the right transaction.
   */
  useEffect(() => {
    if (!isAuthenticated) return;
    void registerForPushNotifications();
  }, [isAuthenticated]);

  useEffect(() => {
    return attachNotificationListeners({
      onTransaction: (reference) => {
        if (!navigationRef.isReady()) return;
        // The ref is typed against a param list this app does not declare, so
        // the call is widened rather than each argument being cast.
        // Activity opens the transaction the alert is about.
        (navigationRef.navigate as (name: string, params?: object) => void)('ActivityTab', { reference });
      },
    });
  }, []);

  /**
   * Start-up, in the redesign's order:
   *
   *   1. the native splash (the logo on green) until the fonts are in — the
   *      animated splash is drawn in Inter, so it cannot start before them
   *   2. the animated splash, for SPLASH_MS or until tapped, while the saved
   *      session is restored underneath
   *   3. if that restore is still going when the splash ends, the heartbeat
   *      loader; otherwise straight into the app
   *
   * The native splash used to wait for the session as well, which is right
   * with nothing else to show but would now just delay the animated one.
   */
  const fontsReady = fontsLoaded || !!fontError;
  const [splashDone, setSplashDone] = useState(false);
  const endSplash = useCallback(() => setSplashDone(true), []);

  useEffect(() => {
    if (fontsReady) SplashScreen.hide();
  }, [fontsReady]);

  if (!fontsReady) return null;

  return (
    <SafeAreaProvider>
      {/* Dark text on the light theme, light on the dark one. The splash sets
          its own while it is showing. */}
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {isLoading ? (
        <HeartbeatFill />
      ) : (
        <NavigationContainer ref={navigationRef} theme={navTheme(isDark)}>
          <AppNavigator />
        </NavigationContainer>
      )}
      {!splashDone ? <AnimatedSplash onDone={endSplash} /> : null}
    </SafeAreaProvider>
  );
}
