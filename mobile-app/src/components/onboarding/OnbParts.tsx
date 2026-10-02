import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, TextInput, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, CircleAlert, Eye, EyeOff } from 'lucide-react-native';
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
  signup,
}: {
  onBack?: () => void;
  step?: 1 | 2 | 3;
  onSignOut?: () => void;
  /** Self sign-up: these setup steps are all "Step 5 of 5", with the whole bar lit. */
  signup?: boolean;
}) {
  const c = useThemeColors();
  const label = signup ? 'Step 5 of 5' : step ? `Step ${step} of 3` : null;
  const bars = signup ? [1, 2, 3, 4, 5] : [1, 2, 3];
  const lit = signup ? 5 : step ?? 0;
  return (
    <View>
      <View style={{ height: 42, marginTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        {onBack ? <IconButton icon={ChevronLeft} label="Back" onPress={onBack} /> : null}
        {label ? <Text style={{ color: c.muted, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>{label}</Text> : null}
        {onSignOut ? (
          <Tap onPress={onSignOut} accessibilityRole="button" hitSlop={10}>
            <Text style={{ color: c.muted, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>Sign out</Text>
          </Tap>
        ) : null}
      </View>
      {label ? <ProgressBar segments={bars.length} lit={lit} /> : null}
    </View>
  );
}

/** The 4 pt progress bar, 6 apart: the first `lit` segments in brand green. */
export function ProgressBar({ segments, lit }: { segments: number; lit: number }) {
  const c = useThemeColors();
  return (
    <View style={{ flexDirection: 'row', gap: 6, marginTop: 14 }} accessibilityElementsHidden>
      {Array.from({ length: segments }, (_, i) => (
        <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i < lit ? c.brand : c.line }} />
      ))}
    </View>
  );
}

/**
 * Sign-up's header (design handoff, "Header and progress"): back button,
 * "Step N of 5", "Save & exit", then the 5-part bar.
 */
export function SignupHeader({ step, onBack, onSaveExit }: { step: number; onBack: () => void; onSaveExit: () => void }) {
  const c = useThemeColors();
  return (
    <View>
      <View style={{ height: 42, marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconButton icon={ChevronLeft} label="Back" onPress={onBack} />
        <Text style={{ flex: 1, color: c.muted, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>{`Step ${step} of 5`}</Text>
        <Tap onPress={onSaveExit} accessibilityRole="button" hitSlop={10}>
          <Text style={{ color: c.muted, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>Save & exit</Text>
        </Tap>
      </View>
      <ProgressBar segments={5} lit={step} />
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

/**
 * The soft red box errors sit in. Sign-up's version (`icon`) leads with an
 * alert icon and can carry an underlined action ("Log in instead").
 */
export function ErrorBox({
  message,
  line = 1.4,
  icon,
  action,
}: {
  message: string;
  line?: number;
  icon?: boolean;
  action?: { label: string; onPress: () => void };
}) {
  const c = useThemeColors();
  if (!message) return null;
  return (
    <View accessibilityLiveRegion="polite" style={{ paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: c.failSoft, gap: 6 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {icon ? (
          <View style={{ paddingTop: 1 }}>
            <CircleAlert color={c.fail} size={16} />
          </View>
        ) : null}
        <Text style={{ flex: 1, color: c.fail, fontSize: 14, lineHeight: 14 * line, fontFamily: 'Inter_400Regular' }}>{message}</Text>
      </View>
      {action ? (
        <Tap onPress={action.onPress} accessibilityRole="button" hitSlop={8} style={{ marginLeft: icon ? 24 : 0, alignSelf: 'flex-start' }}>
          <Text style={{ color: c.fail, fontSize: 14, fontFamily: 'Inter_700Bold', textDecorationLine: 'underline' }}>{action.label}</Text>
        </Tap>
      ) : null}
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
          minHeight: 56,
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
          style={[{ flex: 1, alignSelf: 'stretch', color: c.text, fontSize, fontFamily: 'Inter_400Regular' }, input.style]}
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
