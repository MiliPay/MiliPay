import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from '../screens/auth/LoginScreen';
import ChangePasswordScreen from '../screens/auth/ChangePasswordScreen';
import PinSetupScreen from '../screens/auth/PinSetupScreen';
import BiometricSetupScreen from '../screens/auth/BiometricSetupScreen';

const Stack = createNativeStackNavigator();

export default function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
      <Stack.Screen name="PinSetup" component={PinSetupScreen} />
      <Stack.Screen name="BiometricSetup" component={BiometricSetupScreen} />
    </Stack.Navigator>
  );
}
