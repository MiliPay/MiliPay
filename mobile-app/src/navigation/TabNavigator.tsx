import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AppTabBar } from './AppTabBar';
import HomeScreen from '../screens/main/HomeScreen';
import PalmScreen from '../screens/main/PalmScreen';
import RewardsScreen from '../screens/main/RewardsScreen';
import SettingsScreen from '../screens/main/SettingsScreen';
import ActivityScreen from '../screens/main/ActivityScreen';
import NotificationsScreen from '../screens/main/NotificationsScreen';
import ProfileSettingsScreen from '../screens/main/ProfileSettingsScreen';
import SupportScreen from '../screens/main/SupportScreen';
import SupportChatScreen from '../screens/main/SupportChatScreen';
import AccountLimitsScreen from '../screens/main/AccountLimitsScreen';
import ChangePinScreen from '../screens/main/ChangePinScreen';
import QuickServiceScreen from '../screens/main/QuickServiceScreen';
import ReceiptScreen from '../screens/main/ReceiptScreen';

const Tab = createBottomTabNavigator();
const HomeStack = createNativeStackNavigator();

/**
 * The prototype's `screenIn` for pushed screens (fade in while moving 28 pt,
 * 280 ms). Native stacks have no 28 pt shift, so this is the fade; the
 * duration applies on iOS, Android uses its own.
 */
const PUSHED = { headerShown: false, animation: 'fade', animationDuration: 280 } as const;

function HomeStackNavigator() {
  return (
    <HomeStack.Navigator screenOptions={PUSHED}>
      <HomeStack.Screen name="HomeScreen" component={HomeScreen} />
      <HomeStack.Screen name="QuickService" component={QuickServiceScreen} />
      {/* No swipe-back: a receipt is left with Done or Buy again, never by
          sliding back into a form that has already been paid. */}
      <HomeStack.Screen name="Receipt" component={ReceiptScreen} options={{ gestureEnabled: false, animation: 'fade' }} />
      <HomeStack.Screen name="Notifications" component={NotificationsScreen} />
      <HomeStack.Screen name="ProfileSettings" component={ProfileSettingsScreen} />
      <HomeStack.Screen name="AccountLimits" component={AccountLimitsScreen} />
    </HomeStack.Navigator>
  );
}

const SettingsStack = createNativeStackNavigator();

function SettingsStackNavigator() {
  return (
    <SettingsStack.Navigator screenOptions={PUSHED}>
      <SettingsStack.Screen name="SettingsScreen" component={SettingsScreen} />
      <SettingsStack.Screen name="ProfileSettings" component={ProfileSettingsScreen} />
      <SettingsStack.Screen name="SupportScreen" component={SupportScreen} />
      <SettingsStack.Screen name="SupportChat" component={SupportChatScreen} />
      <SettingsStack.Screen name="AccountLimits" component={AccountLimitsScreen} />
      <SettingsStack.Screen name="ChangePin" component={ChangePinScreen} />
    </SettingsStack.Navigator>
  );
}

/**
 * The redesign's five tabs: Home · Activity · Palm · Rewards · Me.
 *
 * AppTabBar draws the bar (Palm raised in the middle) and hides it on any
 * pushed screen, which replaces the per-screen `tabBarStyle: display none`
 * lists this used to keep — lists that had to be updated by hand every time a
 * screen was added, and were not (a history screen pushed from Home kept the bar).
 */
export default function TabNavigator() {
  return (
    <Tab.Navigator
      // Tab changes fade over 250 ms, as in the prototype.
      screenOptions={{ headerShown: false, animation: 'fade', transitionSpec: { animation: 'timing', config: { duration: 250 } } }}
      tabBar={(props) => <AppTabBar {...props} />}
    >
      <Tab.Screen name="HomeTab" component={HomeStackNavigator} />
      <Tab.Screen name="ActivityTab" component={ActivityScreen} />
      <Tab.Screen name="PalmTab" component={PalmScreen} />
      <Tab.Screen name="RewardsTab" component={RewardsScreen} />
      <Tab.Screen name="MeTab" component={SettingsStackNavigator} />
    </Tab.Navigator>
  );
}
