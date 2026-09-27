import React from 'react';
import { Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { PressScale } from './PressScale';
import { useThemeColors } from '../../theme/useThemeColors';

/**
 * The redesign's 42 pt round button: back arrows, the notification bell.
 * Card-coloured with a hairline and the card shadow; shrinks to 0.94 on press.
 * `badge` draws the red unread count on the top-right corner.
 */
export function IconButton({
  icon: Icon,
  onPress,
  label,
  badge,
  size = 42,
  iconSize = 22,
}: {
  icon: LucideIcon;
  onPress?: () => void;
  /** Spoken by screen readers: an icon-only button has no other name. */
  label: string;
  badge?: number;
  size?: number;
  iconSize?: number;
}) {
  const c = useThemeColors();
  return (
    <PressScale
      scaleTo={0.94}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${badge} unread` : label}
      onPress={onPress}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: c.card,
        borderWidth: 1,
        borderColor: c.cardLine,
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: c.shadow,
      }}
    >
      <Icon color={c.text} size={iconSize} strokeWidth={2} />
      {badge ? (
        <View
          style={{
            position: 'absolute',
            top: -3,
            right: -3,
            minWidth: 18,
            height: 18,
            paddingHorizontal: 5,
            borderRadius: 9,
            backgroundColor: c.fail,
            borderWidth: 2,
            borderColor: c.bg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 10, fontFamily: 'Inter_700Bold' }}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : null}
    </PressScale>
  );
}
