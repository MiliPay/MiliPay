import './global.css';
import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DarkTheme, createNavigationContainerRef } from '@react-navigation/native';
import AppNavigator from './src/navigation/AppNavigator';

export const navigationRef = createNavigationContainerRef();
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { SpaceMono_400Regular, SpaceMono_700Bold } from '@expo-google-fonts/space-mono';
import * as SplashScreen from 'expo-splash-screen';
import { LogBox } from 'react-native';
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';
import { useAuthStore } from './src/store/useStore';
import { useColorScheme } from 'nativewind';
import { loadThemePreference } from './src/lib/themePreference';
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

const appNavTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: 'transparent',
  },
};

export default function App() {
  const initializeAuth = useAuthStore((state) => state.initialize);
  const isLoading = useAuthStore((state) => state.isLoading);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const { setColorScheme } = useColorScheme();
  
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
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
        (navigationRef.navigate as (name: string, params?: object) => void)('HomeTab', {
          screen: 'Transactions',
          params: { reference },
        });
      },
    });
  }, []);

  useEffect(() => {
    // Only dismiss splash screen once BOTH fonts AND auth session restoration are complete
    if ((fontsLoaded || fontError) && !isLoading) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError, isLoading]);

  // Keep native splash screen active while fonts load or auth state is being determined
  if ((!fontsLoaded && !fontError) || isLoading) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer ref={navigationRef} theme={appNavTheme}>
        <AppNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
