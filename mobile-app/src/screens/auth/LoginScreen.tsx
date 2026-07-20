import React, { useRef, useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Lock } from 'lucide-react-native';

import { useAuthStore } from '../../store/useStore';
import { VaultInput, VaultInputRef } from '../../components/ui/VaultInput';
import { SecureButton } from '../../components/ui/SecureButton';
import { GlassCard } from '../../components/ui/GlassCard';

export default function LoginScreen() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const passwordRef = useRef<VaultInputRef>(null);
  
  const navigation = useNavigation<any>();
  const login = useAuthStore((state) => state.login);

  const handleLogin = () => {
    if (!phoneNumber || !password) {
      passwordRef.current?.shake();
      return;
    }

    setIsLoading(true);
    // Simulate network request
    setTimeout(() => {
      setIsLoading(false);
      if (password === '0000') { // Mock logic for first time login
        navigation.navigate('ChangePassword');
      } else {
        login();
      }
    }, 1500);
  };

  return (
    <SafeAreaView className="flex-1 bg-black">
      <LinearGradient
        colors={['rgba(16, 185, 129, 0.15)', 'rgba(0,0,0,1)']}
        className="absolute inset-0"
      />
      
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View className="flex-1 justify-center px-6">
            <View className="items-center mb-12">
              <View className="w-20 h-20 rounded-full bg-white/5 border border-white/10 items-center justify-center mb-6">
                <Lock color="#10b981" size={36} strokeWidth={1.5} />
              </View>
              <Text className="text-white text-3xl font-inter-bold tracking-tight mb-2">
                Identity Gateway
              </Text>
              <Text className="text-white/50 text-base font-inter text-center max-w-[280px]">
                Enter your registered phone number and secure password to authenticate.
              </Text>
            </View>

            <GlassCard intensity={30} className="mb-8">
              <Text className="text-white/60 text-sm font-inter-semibold uppercase tracking-widest mb-3 ml-1">
                Phone Number
              </Text>
              <VaultInput
                label="Phone Number"
                placeholder="080 0000 0000"
                keyboardType="phone-pad"
                value={phoneNumber}
                onChangeText={setPhoneNumber}
              />

              <Text className="text-white/60 text-sm font-inter-semibold uppercase tracking-widest mb-3 ml-1">
                Password
              </Text>
              <VaultInput
                ref={passwordRef}
                label="Password"
                placeholder="Enter password"
                isPassword
                value={password}
                onChangeText={setPassword}
              />
            </GlassCard>

            <SecureButton
              title="Authenticate"
              loading={isLoading}
              onPress={handleLogin}
            />
            
            <View className="mt-8 flex-row justify-center">
              <Text className="text-white/40 font-inter text-sm">
                Protected by BioPay Security Infrastructure
              </Text>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
