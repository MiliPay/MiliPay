import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';

import { Button, Enter, HeartbeatLoader } from '../../components/ds';
import { ErrorBox, OnbField, OnbFrame, OnbHeader, OnbTitle } from '../../components/onboarding/OnbParts';
import { useThemeColors } from '../../theme/useThemeColors';
import { brandFixed } from '../../theme/tokens';
import { useAuthStore } from '../../store/useStore';
import { passwordRules, passwordStrength, passwordValid } from '../../lib/onboardingView';

/**
 * "Create your password" (design handoff, screen 3, step 2): a 4-part
 * strength meter and the three rules ticking off as they are met. Saved with
 * Supabase Auth; the server flag that keeps the customer here clears only
 * once the password has actually changed.
 */
export default function CreatePasswordScreen({ navigation }: any) {
  const c = useThemeColors();
  const changePassword = useAuthStore((s) => s.changePassword);
  const logout = useAuthStore((s) => s.logout);
  const signup = useAuthStore((s) => s.onboarding?.signupSource === 'self');

  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const strength = passwordStrength(pw);
  const segColour = strength.tone === 'brand' ? '#00C896' : strength.tone === 'warn' ? '#EAB308' : c.fail;
  const rules = passwordRules(pw, again);
  const valid = passwordValid(pw, again);

  const save = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError('');
    const result = await changePassword(pw);
    setBusy(false);
    if (!result.success) {
      setError(result.error || "Couldn't save your password. Please try again.");
      return;
    }
    navigation.navigate('PinSetup');
  };

  return (
    <OnbFrame>
      {/* Sign-up's step 5 has no "Sign out" (the account was just made). */}
      <OnbHeader step={1} signup={signup} onSignOut={signup ? undefined : () => void logout()} />
      <Enter kind="screenIn" style={{ flex: 1, marginTop: 22 }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1, gap: 16 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <OnbTitle title="Create your password" sub="You'll use it to log in on a new phone. Keep it to yourself." />
          <ErrorBox message={error} />
          <View style={{ gap: 8 }}>
            <OnbField
              label="New password"
              value={pw}
              onChangeText={(t) => {
                setPw(t);
                setError('');
              }}
              placeholder="At least 8 characters"
              secret
              textContentType="newPassword"
              autoComplete="password-new"
              autoFocus
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 }}>
              <View style={{ flex: 1, flexDirection: 'row', gap: 4 }}>
                {[0, 1, 2, 3].map((i) => (
                  <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i < strength.segments ? segColour : c.line }} />
                ))}
              </View>
              <Text style={{ minWidth: 52, textAlign: 'right', color: segColour, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>
                {strength.label}
              </Text>
            </View>
          </View>
          <OnbField
            label="Confirm password"
            value={again}
            onChangeText={setAgain}
            placeholder="Type it again"
            secureTextEntry
            textContentType="newPassword"
            onSubmitEditing={save}
          />
          <View style={{ gap: 8, paddingVertical: 4, paddingHorizontal: 2 }}>
            {rules.map((r) => (
              <View key={r.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    borderWidth: 1.5,
                    borderColor: r.ok ? '#00C896' : c.line,
                    backgroundColor: r.ok ? '#00C896' : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {r.ok ? <Check color={brandFixed.onBrand} size={12} strokeWidth={3} /> : null}
                </View>
                <Text style={{ color: r.ok ? c.text : c.muted, fontSize: 14, fontFamily: 'Inter_400Regular' }}>{r.label}</Text>
              </View>
            ))}
          </View>
          <View style={{ flex: 1, minHeight: 16 }} />
          <Button label="Save password" disabled={!valid} onPress={save} />
        </ScrollView>
      </Enter>
      <HeartbeatLoader visible={busy} />
    </OnbFrame>
  );
}
