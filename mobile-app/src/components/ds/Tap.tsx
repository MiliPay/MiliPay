import React, { useState } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

type TapStyle = StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);

/**
 * A Pressable whose style may depend on being pressed — `style={({ pressed }) => …}`
 * — and actually keeps it.
 *
 * NativeWind wraps React Native's Pressable to read `className`, and in doing
 * so it drops a style given as a function: the row that should have been an
 * icon, name and amount side by side came out stacked, cards lost their fill
 * and borders, and the sheet's close button fell to the bottom. This works out
 * the pressed state itself and hands Pressable a plain style, which the
 * wrapper passes through untouched.
 *
 * Use it for every tappable whose look changes on press. A plain object style
 * on Pressable is fine as it is.
 */
export function Tap({
  style,
  onPressIn,
  onPressOut,
  ...rest
}: Omit<PressableProps, 'style'> & { style?: TapStyle }) {
  const [pressed, setPressed] = useState(false);
  const resolved = typeof style === 'function' ? style({ pressed }) : style;
  return (
    <Pressable
      {...rest}
      onPressIn={(e) => {
        setPressed(true);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        onPressOut?.(e);
      }}
      style={resolved}
    />
  );
}
