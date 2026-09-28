import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PAGE_PADDING, TabTitle } from '../../components/ds/Layout';
import { LimitsCard } from '../../components/me/LimitsCard';
import { useThemeColors } from '../../theme/useThemeColors';

/**
 * Palm Pay tab. "Your limits" is here, where the design puts it. The palm
 * status card, "pays from", pausing, how to pay at a terminal and palm
 * payments arrive with the redesign's Palm phase.
 */
export default function PalmScreen({ navigation }: any) {
  const c = useThemeColors();
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
          <View style={{ paddingTop: 10, paddingHorizontal: PAGE_PADDING }}>
            <TabTitle>Palm Pay</TabTitle>
          </View>
          <LimitsCard onTierDetails={() => navigation.navigate('MeTab', { screen: 'AccountLimits', initial: false })} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
