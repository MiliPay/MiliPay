import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import WelcomeScreen from '../screens/auth/WelcomeScreen';
import PhoneLoginScreen from '../screens/auth/PhoneLoginScreen';

const Stack = createNativeStackNavigator();

/**
 * Signed out (design handoff, screen 3): Welcome, then "Log in to MiliPay"
 * by phone number and SMS code. What follows a first sign-in (password, PIN,
 * fingerprint) is OnboardingNavigator, which renders once there is a session.
 */
export default function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="PhoneLogin" component={PhoneLoginScreen} />
    </Stack.Navigator>
  );
}
