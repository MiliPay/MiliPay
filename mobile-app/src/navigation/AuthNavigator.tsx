import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from '../screens/auth/LoginScreen';

const Stack = createNativeStackNavigator();

/**
 * Pre-authentication only. The first-login steps moved to OnboardingNavigator,
 * which renders after sign-in — they used to live here, where they were
 * unreachable because this whole stack unmounts the moment a session exists.
 */
export default function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
    </Stack.Navigator>
  );
}
