import React from 'react';
import { ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, PAGE_PADDING, TabTitle } from '../../components/ds/Layout';
import { useThemeColors } from '../../theme/useThemeColors';

/**
 * Palm Pay tab. Its place in the tab bar is final; its contents arrive in the
 * redesign's Palm phase (enrolment status, pause, "pays from", limits).
 */
export default function PalmScreen() {
  const c = useThemeColors();
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-canvas">
      <ScrollView contentContainerStyle={{ padding: PAGE_PADDING, gap: 14 }}>
        <TabTitle>Palm Pay</TabTitle>
        <Card>
          <Text style={{ color: c.muted, fontSize: 15, fontFamily: 'Inter_400Regular' }}>
            Your palm status, limits and settings will appear here.
          </Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
