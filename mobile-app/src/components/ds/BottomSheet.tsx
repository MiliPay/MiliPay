import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../theme/useThemeColors';

/** The prototype's curve for sheets and pushed screens: cubic-bezier(.2,.8,.2,1). */
export const EASE_OUT = Easing.bezier(0.2, 0.8, 0.2, 1);

/**
 * The redesign's bottom sheet: scrim fades in (200 ms), the sheet rises
 * (`sheetUp`, 340 ms), top corners 30, a 40×5 handle, at most 86% of the
 * screen, scrolling beyond that.
 *
 * `dismissible={false}` is for sheets that must not be closed mid-flight —
 * the payment progress sheet: tapping the scrim or pressing Back does nothing.
 * It animates out before it unmounts, so closing looks as deliberate as
 * opening.
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  dismissible = true,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  /** Optional 20/800 title row with a round close button. */
  title?: string;
  dismissible?: boolean;
  children: React.ReactNode;
}) {
  const c = useThemeColors();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      progress.value = withTiming(1, { duration: 340, easing: EASE_OUT });
    } else if (mounted) {
      progress.value = withTiming(0, { duration: 220, easing: EASE_OUT }, (done) => {
        if (done) runOnJS(setMounted)(false);
      });
    }
  }, [visible, mounted, progress]);

  const scrim = useAnimatedStyle(() => ({ opacity: Math.min(1, progress.value * 1.7) }));
  const sheet = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - progress.value) * height }] }));

  const requestClose = () => {
    if (dismissible) onClose();
  };

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={requestClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View style={[{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: c.scrim }, scrim]}>
          <Pressable
            style={{ flex: 1 }}
            onPress={requestClose}
            accessibilityRole={dismissible ? 'button' : undefined}
            accessibilityLabel={dismissible ? 'Close' : undefined}
          />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          style={[
            {
              backgroundColor: c.sheet,
              borderTopLeftRadius: 30,
              borderTopRightRadius: 30,
              maxHeight: height * 0.86,
              paddingTop: 10,
              paddingHorizontal: 20,
              paddingBottom: Math.max(36, insets.bottom + 16),
            },
            sheet,
          ]}
        >
          <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: c.line, alignSelf: 'center', marginBottom: 14 }} />
          {title ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Text accessibilityRole="header" style={{ color: c.text, fontSize: 20, fontFamily: 'Inter_800ExtraBold', letterSpacing: -0.4 }}>
                {title}
              </Text>
              {dismissible ? (
                <Pressable
                  onPress={onClose}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  hitSlop={6}
                  style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c.chip, alignItems: 'center', justifyContent: 'center' }}
                >
                  <X color={c.text} size={18} />
                </Pressable>
              ) : null}
            </View>
          ) : null}
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
