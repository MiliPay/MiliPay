import React from 'react';
import { ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, PAGE_PADDING, TabTitle } from '../../components/ds/Layout';
import { useThemeColors } from '../../theme/useThemeColors';

/**
 * Rewards tab. Its place in the tab bar is final; its contents arrive in the
 * redesign's Rewards phase, fed by real data only — no sample balances.
 */
export default function RewardsScreen() {
  const c = useThemeColors();
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ padding: PAGE_PADDING, gap: 14 }}>
        <TabTitle>Rewards</TabTitle>
        <Card>
          <Text style={{ color: c.muted, fontSize: 15, fontFamily: 'Inter_400Regular' }}>
            Cashback and offers will appear here.
          </Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
