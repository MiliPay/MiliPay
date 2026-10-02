import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import WelcomeScreen from '../screens/auth/WelcomeScreen';
import PhoneLoginScreen from '../screens/auth/PhoneLoginScreen';
import SignupScreen from '../screens/auth/SignupScreen';
import UnlockScreen from '../screens/auth/UnlockScreen';

const Stack = createNativeStackNavigator();

/**
 * Signed out (design handoff, screen 3): Welcome; "Create an account" (self
 * sign-up, Tier 1); or "Log in to MiliPay"
 * by phone number and SMS code (or, failing that, by password — the Unlock
 * screen's "Log in" form). What follows a first sign-in (password, PIN,
 * fingerprint) is OnboardingNavigator, which renders once there is a session.
 */
export default function AuthNavigator() {
  return (
    // No stack slide: each step draws its own entrance (the prototype's
    // screenIn), as they are one screen in the design.
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'none' }}>
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="Signup" component={SignupScreen} options={{ gestureEnabled: false }} />
      <Stack.Screen name="PhoneLogin" component={PhoneLoginScreen} />
      <Stack.Screen name="PasswordLogin" component={UnlockScreen} />
    </Stack.Navigator>
  );
}
