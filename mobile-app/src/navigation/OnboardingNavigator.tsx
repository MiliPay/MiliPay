import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import ChangePasswordScreen from '../screens/auth/ChangePasswordScreen';
import PinSetupScreen from '../screens/auth/PinSetupScreen';
import BiometricSetupScreen from '../screens/auth/BiometricSetupScreen';
import { useAuthStore } from '../store/useStore';

const Stack = createNativeStackNavigator();

/**
 * First-login setup: change the one-time password, set a PIN, then enrol
 * fingerprint unlock.
 *
 * The initial route is whichever step is still outstanding, so a customer who
 * gets halfway and kills the app resumes where they left off rather than being
 * asked to change an already-changed password.
 *
 * `gestureEnabled: false` and no headers: these steps are not dismissible.
 * The only way out is forward, or signing out from the password screen.
 */
export default function OnboardingNavigator() {
  const onboarding = useAuthStore((state) => state.onboarding);

  const initialRouteName = onboarding?.mustChangePassword
    ? 'ChangePassword'
    : !onboarding?.hasPin
    ? 'PinSetup'
    : 'BiometricSetup';

  return (
    <Stack.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{ headerShown: false, gestureEnabled: false }}
    >
      <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
      <Stack.Screen name="PinSetup" component={PinSetupScreen} />
      <Stack.Screen name="BiometricSetup" component={BiometricSetupScreen} />
    </Stack.Navigator>
  );
}
