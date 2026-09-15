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
