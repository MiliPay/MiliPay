import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, TextInput, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Eye, EyeOff } from 'lucide-react-native';
import { IconButton } from '../ds';
import { Tap } from '../ds/Tap';
import { useThemeColors } from '../../theme/useThemeColors';

/**
 * The sign-in and first-setup screens' frame (design handoff, screen 3):
 * page colour, 24 pt sides, content to the bottom with the main button there.
 */
export function OnbFrame({ children, top = 0 }: { children: React.ReactNode; top?: number }) {
  const c = useThemeColors();
  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: top, paddingBottom: 24 }}>{children}</View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * The 42 pt row at the top: a back button (step 1), or "Step N of 3" with
 * "Sign out" on the first of them; then the 3-part progress bar.
 */
export function OnbHeader({
  onBack,
  step,
  onSignOut,
}: {
  onBack?: () => void;
  step?: 1 | 2 | 3;
  onSignOut?: () => void;
}) {
  const c = useThemeColors();
  return (
    <View>
      <View style={{ height: 42, marginTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        {onBack ? <IconButton icon={ChevronLeft} label="Back" onPress={onBack} /> : null}
        {step ? <Text style={{ color: c.muted, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>{`Step ${step} of 3`}</Text> : null}
        {onSignOut ? (
          <Tap onPress={onSignOut} accessibilityRole="button" hitSlop={10}>
            <Text style={{ color: c.muted, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>Sign out</Text>
          </Tap>
        ) : null}
      </View>
      {step ? (
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 14 }} accessibilityElementsHidden>
          {[1, 2, 3].map((i) => (
            <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: step >= i ? c.brand : c.line }} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** 28/800 title over a 15 pt muted line. */
export function OnbTitle({ title, sub }: { title: string; sub: string }) {
  const c = useThemeColors();
  return (
    <View style={{ gap: 6 }}>
      <Text accessibilityRole="header" style={{ color: c.text, fontSize: 28, fontFamily: 'Inter_800ExtraBold', letterSpacing: -0.7 }}>
        {title}
      </Text>
      <Text style={{ color: c.muted, fontSize: 15, lineHeight: 22.5, fontFamily: 'Inter_400Regular' }}>{sub}</Text>
    </View>
  );
}

/** The soft red box errors sit in. */
export function ErrorBox({ message, line = 1.4 }: { message: string; line?: number }) {
  const c = useThemeColors();
  if (!message) return null;
  return (
    <View accessibilityLiveRegion="polite" style={{ paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: c.failSoft }}>
      <Text style={{ color: c.fail, fontSize: 14, lineHeight: 14 * line, fontFamily: 'Inter_400Regular' }}>{message}</Text>
    </View>
  );
}

/** A 13/600 muted label over a 56 pt box (radius 16, card, 1.5 pt line). */
export function OnbField({
  label,
  labelRight,
  left,
  secret,
  fontSize = 17,
  ...input
}: TextInputProps & {
  label: string;
  labelRight?: React.ReactNode;
  left?: React.ReactNode;
  /** A password: hidden, with the eye to show it. */
  secret?: boolean;
  fontSize?: number;
}) {
  const c = useThemeColors();
  const [shown, setShown] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: c.muted, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>{label}</Text>
        {labelRight}
      </View>
      <View
        style={{
          height: 56,
          borderRadius: 16,
          backgroundColor: c.card,
          borderWidth: 1.5,
          borderColor: c.line,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 16,
        }}
      >
        {left}
        <TextInput
          placeholderTextColor={c.faint}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry={secret && !shown}
          accessibilityLabel={label}
          {...input}
          style={[{ flex: 1, height: '100%', color: c.text, fontSize, fontFamily: 'Inter_400Regular' }, input.style]}
        />
        {secret ? (
          <Tap
            onPress={() => setShown((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={shown ? 'Hide password' : 'Show password'}
            hitSlop={10}
          >
            {shown ? <EyeOff color={c.faint} size={20} /> : <Eye color={c.faint} size={20} />}
          </Tap>
        ) : null}
      </View>
    </View>
  );
}

/** A centred 14/600 text button (Log in with password, Not now…). */
export function TextButton({
  label,
  onPress,
  tone = 'brand',
  padding = 6,
  size = 14,
}: {
  label: string;
  onPress: () => void;
  tone?: 'brand' | 'muted';
  padding?: number;
  size?: number;
}) {
  const c = useThemeColors();
  return (
    <Tap onPress={onPress} accessibilityRole="button" style={{ padding, alignSelf: 'stretch', alignItems: 'center' }}>
      <Text style={{ color: tone === 'brand' ? c.brandText : c.muted, fontSize: size, fontFamily: 'Inter_600SemiBold', textAlign: 'center' }}>
        {label}
      </Text>
    </Tap>
  );
}
