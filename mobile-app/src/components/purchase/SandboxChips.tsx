import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { IS_SANDBOX, type SandboxCase } from '../../lib/environment';

/**
 * The VTPass sandbox's test inputs, offered as chips — for testers only.
 *
 * Renders NOTHING unless this build declares itself sandbox. IS_SANDBOX is a
 * compile-time constant, and the case lists come from environment.ts's
 * guarded functions, so a production bundle carries neither the chips nor
 * the numbers (tests/gateway-isolation.test.ts holds that line).
 */
export function SandboxChips({ cases, onPick }: { cases: SandboxCase[]; onPick: (value: string) => void }) {
  if (!IS_SANDBOX || cases.length === 0) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 8, marginHorizontal: 20 }}>
      <Text style={{ color: '#B45309', fontSize: 9, fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 0.9 }}>Sandbox</Text>
      {cases.map((c) => (
        <Pressable
          key={c.value}
          onPress={() => onPick(c.value)}
          accessibilityRole="button"
          accessibilityLabel={`Sandbox test value ${c.label}`}
          style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(245, 158, 11, 0.15)', borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.3)' }}
        >
          <Text style={{ color: '#B45309', fontSize: 10, fontFamily: 'Inter_700Bold' }}>{c.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
