import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import CreatePasswordScreen from '../screens/auth/CreatePasswordScreen';
import PinSetupScreen from '../screens/auth/PinSetupScreen';
import FingerprintSetupScreen from '../screens/auth/FingerprintSetupScreen';
import AllSetScreen from '../screens/auth/AllSetScreen';
import { useAuthStore } from '../store/useStore';

const Stack = createNativeStackNavigator();

/**
 * First sign-in setup (design handoff, screen 3, steps 2–4 and done): create
 * a password, set a PIN, offer fingerprint, then "You're all set".
 *
 * The first screen is whichever step is still outstanding, so a customer who
 * gets halfway and closes the app resumes where they left off. These steps
 * cannot be swiped away; the only way out is forward, or "Sign out" on the
 * password step.
 */
export default function OnboardingNavigator() {
  const onboarding = useAuthStore((state) => state.onboarding);

  const initialRouteName = onboarding?.mustChangePassword
    ? 'CreatePassword'
    : !onboarding?.hasPin
    ? 'PinSetup'
    : 'FingerprintSetup';

  return (
    <Stack.Navigator initialRouteName={initialRouteName} screenOptions={{ headerShown: false, gestureEnabled: false, animation: 'none' }}>
      <Stack.Screen name="CreatePassword" component={CreatePasswordScreen} />
      <Stack.Screen name="PinSetup" component={PinSetupScreen} />
      <Stack.Screen name="FingerprintSetup" component={FingerprintSetupScreen} />
      <Stack.Screen name="AllSet" component={AllSetScreen} options={{ animation: 'fade' }} />
    </Stack.Navigator>
  );
}
