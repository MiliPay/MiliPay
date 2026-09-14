import React from 'react';
import { useAuthStore } from '../store/useStore';

import AuthNavigator from './AuthNavigator';
import TabNavigator from './TabNavigator';

export default function AppNavigator() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return isAuthenticated ? <TabNavigator /> : <AuthNavigator />;
}
