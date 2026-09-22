import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  Pressable, 
  KeyboardAvoidingView, 
  Platform, 
  TouchableWithoutFeedback, 
  Keyboard, 
  ActivityIndicator,
  Alert,
  Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
import { Eye, EyeOff } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { useAuthStore } from '../../store/useStore';

const logoLight = require('../../../assets/logo.png');
const logoDark = require('../../../assets/logo-white.png');

export default function LoginScreen() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme !== 'light';

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const login = useAuthStore((state) => state.login);

  const handleLogin = async () => {
    Keyboard.dismiss();
    setErrorMsg('');

    if (!phone.trim() || !password.trim()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrorMsg('Please enter your phone number and password.');
      return;
    }

    setIsLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      await login(phone, password);
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrorMsg(error?.message || 'Invalid login details.');
      setIsLoading(false);
    }
  };

  const handleForgotPassword = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      'Forgot Password',
      'Your login password was sent to your registered email and phone number when you enrolled with an authorized Agent. Please check your messages or contact support@milipay.app.',
      [{ text: 'OK' }]
    );
  };

  return (
    <SafeAreaView 
      className="flex-1 bg-white dark:bg-black"
      style={{ backgroundColor: isDark ? '#000000' : '#ffffff' }}
    >
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View className="flex-1 justify-center px-8">
            
            {/* Centered Brand Logo & Login Header */}
            <View className="items-center mb-8">
              <View style={{ width: 220, height: 56, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                <Image 
                  source={isDark ? logoDark : logoLight}
                  style={{ width: 220, height: 56 }}
                  resizeMode="contain"
                />
              </View>
              <Text className="text-slate-900 dark:text-white text-3xl font-inter-bold tracking-tight text-center">
                Log in
              </Text>
              <Text className="text-slate-500 dark:text-zinc-400 font-inter text-sm text-center mt-1.5">
                Enter your phone number and password
              </Text>
            </View>

            {/* Error Message */}
            {errorMsg ? (
              <View className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/40">
                <Text className="text-red-600 dark:text-red-400 font-inter text-sm">
                  {errorMsg}
                </Text>
              </View>
            ) : null}

            {/* Inputs */}
            <View>
              {/* Phone Number */}
              <View className="mb-4">
                <Text className="text-slate-700 dark:text-slate-300 font-inter-medium text-sm mb-1.5">
                  Phone Number
                </Text>
                <TextInput
                  value={phone}
                  onChangeText={(t) => {
                    setPhone(t);
                    if (errorMsg) setErrorMsg('');
                  }}
                  placeholder="080 0000 0000"
                  placeholderTextColor={isDark ? '#52525b' : '#94a3b8'}
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                  autoCorrect={false}
                  className="h-14 px-4 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white font-inter text-base"
                />
              </View>

              {/* Password */}
              <View className="mb-6">
                <View className="flex-row justify-between items-center mb-1.5">
                  <Text className="text-slate-700 dark:text-slate-300 font-inter-medium text-sm">
                    Password
                  </Text>
                  <Pressable onPress={handleForgotPassword} hitSlop={8}>
                    <Text className="text-signal-dim dark:text-signal-bright font-inter-medium text-xs">
                      Forgot password?
                    </Text>
                  </Pressable>
                </View>
                <View className="flex-row items-center h-14 px-4 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
                  <TextInput
                    value={password}
                    onChangeText={(t) => {
                      setPassword(t);
                      if (errorMsg) setErrorMsg('');
                    }}
                    placeholder="Enter password"
                    placeholderTextColor={isDark ? '#52525b' : '#94a3b8'}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    className="flex-1 text-slate-900 dark:text-white font-inter text-base"
                  />
                  <Pressable 
                    onPress={() => setShowPassword(!showPassword)} 
                    hitSlop={8}
                    className="p-1 -mr-1"
                  >
                    {showPassword ? (
                      <EyeOff color={isDark ? '#71717a' : '#94a3b8'} size={20} />
                    ) : (
                      <Eye color={isDark ? '#71717a' : '#94a3b8'} size={20} />
                    )}
                  </Pressable>
                </View>
              </View>

              {/* Submit Button */}
              <Pressable
                onPress={handleLogin}
                disabled={isLoading}
                className={`h-14 rounded-xl items-center justify-center bg-signal active:bg-signal ${
                  isLoading ? 'opacity-70' : ''
                }`}
              >
                {isLoading ? (
                  <ActivityIndicator color="#000" size="small" />
                ) : (
                  <Text className="text-black font-inter-bold text-base">
                    Log in
                  </Text>
                )}
              </Pressable>
            </View>

            {/* Note on how users get their login details */}
            <View className="mt-8 px-4 py-3.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
              <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs text-center leading-relaxed">
                Your login password was sent to your registered email and phone number when you enrolled with an authorized Agent.
              </Text>
            </View>

          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
