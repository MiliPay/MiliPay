import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  FadeOut,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { StatusBar } from 'expo-status-bar';
import { EASE_OUT } from './BottomSheet';

const MARK = require('../../../assets/splash-mark.png');

/** How long the splash stays before moving on (the prototype's runSplash). */
export const SPLASH_MS = 2600;

/**
 * The redesign's splash (README, screen 1): a full-bleed green radial
 * gradient, concentric rings, the logo tile popping in and then beating with
 * two rings pulsing off it, "MiliPay" and "Payments in milliseconds" rising
 * underneath. It moves on by itself after SPLASH_MS; a tap skips it.
 *
 * The prototype also shows "Licensed and secured" at the bottom. That line is
 * deliberately not drawn: MiliPay does not hold a licence yet, and the splash
 * is the first thing every customer reads.
 */
export function AnimatedSplash({ onDone }: { onDone: () => void }) {
  const window = useWindowDimensions();
  // The splash's own measured size. Android's window size can leave out the
  // strip behind the system bars, and the gradient drawn to that size let the
  // tab bar show underneath.
  const [size, setSize] = useState({ width: window.width, height: window.height });
  const { width, height } = size;

  useEffect(() => {
    const t = setTimeout(onDone, SPLASH_MS);
    return () => clearTimeout(t);
  }, [onDone]);

  const centreY = height * 0.4;

  return (
    <Animated.View
      exiting={FadeOut.duration(250)}
      onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
      // Above everything: on Android anything with elevation (a shadowed
      // card, the raised Palm button) otherwise draws over a later sibling.
      style={[StyleSheet.absoluteFill, { zIndex: 9999, elevation: 9999, backgroundColor: '#022C22' }]}
    >
      <StatusBar style="light" />
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onDone}
        accessibilityRole="button"
        accessibilityLabel="MiliPay. Payments in milliseconds. Tap to continue."
      >
        {/* radial-gradient(120% 80% at 50% 38%, #0a7a5a, #065f46 38%, #022c22 78%, #011a14) */}
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient id="bg" cx="50%" cy="38%" rx="120%" ry="80%" fx="50%" fy="38%" gradientUnits="objectBoundingBox">
              <Stop offset="0" stopColor="#0A7A5A" />
              <Stop offset="0.38" stopColor="#065F46" />
              <Stop offset="0.78" stopColor="#022C22" />
              <Stop offset="1" stopColor="#011A14" />
            </RadialGradient>
            {/* A 250 pt disc of rgba(0,200,150,.14) under blur(30px). */}
            <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#00C896" stopOpacity="0.14" />
              <Stop offset="0.62" stopColor="#00C896" stopOpacity="0.12" />
              <Stop offset="1" stopColor="#00C896" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#bg)" />
          <Rect x={width / 2 - 155} y={centreY - 155} width={310} height={310} fill="url(#glow)" />
        </Svg>

        <Ring size={520} centreY={centreY} colour="rgba(51, 224, 181, 0.10)" />
        <Ring size={380} centreY={centreY} colour="rgba(51, 224, 181, 0.14)" />

        {/* As the prototype lays it out: the logo, name and tagline centred
            on the screen as one block, then lifted 60 pt (margin-top: -60px). */}
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]} pointerEvents="none">
          <View style={{ marginTop: -60, alignItems: 'center' }}>
            <LogoTile />
            <Rise delay={250}>
              <Text style={{ color: '#FFFFFF', fontSize: 38, fontFamily: 'Inter_800ExtraBold', letterSpacing: -1.33, marginTop: 26 }}>
                MiliPay
              </Text>
            </Rise>
            <Rise delay={400}>
              <Text style={{ color: '#9FE8D2', fontSize: 15, fontFamily: 'Inter_500Medium', marginTop: 6 }}>Payments in milliseconds</Text>
            </Rise>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function Ring({ size, centreY, colour }: { size: number; centreY: number; colour: string }) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        alignSelf: 'center',
        top: centreY - size / 2,
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1,
        borderColor: colour,
      }}
    />
  );
}

/** The white 128 pt tile: `pop` in (0.6 s), then `heartbeat` with two `beatRing`s. */
function LogoTile() {
  const scale = useSharedValue(0.5);
  const opacity = useSharedValue(0);

  useEffect(() => {
    const ease = Easing.inOut(Easing.ease);
    opacity.value = withTiming(1, { duration: 300 });
    scale.value = withSequence(
      withTiming(1.08, { duration: 420, easing: EASE_OUT }),
      withTiming(1, { duration: 180, easing: EASE_OUT }),
      withRepeat(
        withSequence(
          withTiming(1.14, { duration: 182, easing: ease }),
          withTiming(1, { duration: 182, easing: ease }),
          withTiming(1.09, { duration: 182, easing: ease }),
          withTiming(1, { duration: 364, easing: ease }),
          withTiming(1, { duration: 390 }),
        ),
        -1,
      ),
    );
    return () => {
      cancelAnimation(scale);
      cancelAnimation(opacity);
    };
  }, [scale, opacity]);

  const tile = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));

  return (
    <Animated.View
      style={[
        {
          width: 128,
          height: 128,
          borderRadius: 36,
          backgroundColor: '#FFFFFF',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0px 24px 50px -16px rgba(0, 0, 0, 0.55)',
        },
        tile,
      ]}
    >
      <BeatRing delay={600} colour="rgba(51, 224, 181, 0.7)" />
      <BeatRing delay={780} colour="rgba(51, 224, 181, 0.45)" />
      <Animated.Image source={MARK} resizeMode="contain" style={{ width: 112, height: 112 }} />
    </Animated.View>
  );
}

/** `beatRing`: scale .92 → 1.55 while fading .6 → 0 over the first 60% of 1.3 s. */
function BeatRing({ delay, colour }: { delay: number; colour: string }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(delay, withRepeat(withTiming(1, { duration: 1300, easing: Easing.out(Easing.ease) }), -1));
    return () => cancelAnimation(v);
  }, [delay, v]);
  const style = useAnimatedStyle(() => {
    const t = Math.min(1, v.value / 0.6);
    return { opacity: v.value === 0 ? 0 : 0.6 * (1 - t), transform: [{ scale: 0.92 + 0.63 * t }] };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: 36, borderWidth: 2, borderColor: colour }, style]}
    />
  );
}

/** `rise`: 14 pt up and in over 0.5 s, after `delay`. */
function Rise({ delay, children }: { delay: number; children: React.ReactNode }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withTiming(1, { duration: 500, easing: EASE_OUT }));
  }, [delay, p]);
  const style = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * 14 }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}
