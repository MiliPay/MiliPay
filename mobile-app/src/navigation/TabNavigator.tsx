import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { useColorScheme } from 'nativewind';
import { Home, Compass, Settings } from 'lucide-react-native';

import HomeScreen from '../screens/main/HomeScreen';
import ServicesScreen from '../screens/main/ServicesScreen';
import ExploreScreen from '../screens/main/ExploreScreen';
import SettingsScreen from '../screens/main/SettingsScreen';
import TransactionsScreen from '../screens/main/TransactionsScreen';
import ProfileSettingsScreen from '../screens/main/ProfileSettingsScreen';
import SupportScreen from '../screens/main/SupportScreen';
import AccountLimitsScreen from '../screens/main/AccountLimitsScreen';

const Tab = createBottomTabNavigator();
const HomeStack = createNativeStackNavigator();

function HomeStackNavigator() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="HomeScreen" component={HomeScreen} />
      <HomeStack.Screen name="Services" component={ServicesScreen} />
      <HomeStack.Screen name="Transactions" component={TransactionsScreen} />
      <HomeStack.Screen name="ProfileSettings" component={ProfileSettingsScreen} />
    </HomeStack.Navigator>
  );
}

const SettingsStack = createNativeStackNavigator();

function SettingsStackNavigator() {
  return (
    <SettingsStack.Navigator screenOptions={{ headerShown: false }}>
      <SettingsStack.Screen name="SettingsScreen" component={SettingsScreen} />
      <SettingsStack.Screen name="ProfileSettings" component={ProfileSettingsScreen} />
      <SettingsStack.Screen name="SupportScreen" component={SupportScreen} />
      <SettingsStack.Screen name="AccountLimits" component={AccountLimitsScreen} />
    </SettingsStack.Navigator>
  );
}

export default function TabNavigator() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme !== 'light';

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: isDark ? '#000' : '#fff', 
          borderTopColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', 
        },
        tabBarActiveTintColor: '#10b981', 
        tabBarInactiveTintColor: isDark ? '#6b7280' : '#9ca3af', 
      }}
    >
      <Tab.Screen 
        name="HomeTab" 
        component={HomeStackNavigator} 
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />
        }}
      />
      <Tab.Screen 
        name="ExploreTab" 
        component={ExploreScreen} 
        options={{
          tabBarLabel: 'Explore',
          tabBarIcon: ({ color, size }) => <Compass color={color} size={size} />
        }}
      />
      <Tab.Screen 
        name="SettingsTab" 
        component={SettingsStackNavigator} 
        options={({ route }) => {
          const routeName = getFocusedRouteNameFromRoute(route) ?? '';
          const isSupportScreen = routeName === 'SupportScreen';
          return {
            tabBarLabel: 'Settings',
            tabBarIcon: ({ color, size }) => <Settings color={color} size={size} />,
            tabBarStyle: isSupportScreen 
              ? { display: 'none' } 
              : {
                  backgroundColor: isDark ? '#000' : '#fff', 
                  borderTopColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', 
                }
          };
        }}
      />
    </Tab.Navigator>
  );
}
