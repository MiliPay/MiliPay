import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Home, Compass, Settings } from 'lucide-react-native';

import HomeScreen from '../screens/main/HomeScreen';
import ServicesScreen from '../screens/main/ServicesScreen';
import PlaceholderScreen from '../screens/main/PlaceholderScreen';
import SettingsScreen from '../screens/main/SettingsScreen';

const Tab = createBottomTabNavigator();
const HomeStack = createNativeStackNavigator();

function HomeStackNavigator() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="HomeScreen" component={HomeScreen} />
      <HomeStack.Screen name="Services" component={ServicesScreen} />
    </HomeStack.Navigator>
  );
}

export default function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#111827', // gray-900
          borderTopColor: '#374151', // gray-700
        },
        tabBarActiveTintColor: '#22c55e', // green-500
        tabBarInactiveTintColor: '#9ca3af', // gray-400
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
        name="ComingSoonTab" 
        component={PlaceholderScreen} 
        options={{
          tabBarLabel: 'Explore',
          tabBarIcon: ({ color, size }) => <Compass color={color} size={size} />
        }}
      />
      <Tab.Screen 
        name="SettingsTab" 
        component={SettingsScreen} 
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color, size }) => <Settings color={color} size={size} />
        }}
      />
    </Tab.Navigator>
  );
}
