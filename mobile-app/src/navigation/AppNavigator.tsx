import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { useAuthStore } from '../store/useStore';

import AuthNavigator from './AuthNavigator';
import TabNavigator from './TabNavigator';

export default function AppNavigator() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return (
    <NavigationContainer>
      {isAuthenticated ? <TabNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}
