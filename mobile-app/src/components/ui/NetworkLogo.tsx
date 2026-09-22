import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

/**
 * The four networks, as their own marks rather than a coloured dot.
 *
 * A row of four identical dots in four colours asks the customer to remember
 * which colour is which network. The mark does not: it is the thing they
 * already recognise from every recharge card and billboard, and picking the
 * wrong network is the commonest way an airtime purchase goes to the wrong
 * place and cannot be undone.
 *
 * These are drawn in code, from each carrier's own brand colours and wordmark,
 * rather than shipped as bitmaps. That keeps them crisp at any size, adds
 * nothing to the bundle, and means there is no licensed artwork checked into
 * the repository. If MiliPay is ever given the carriers' official asset packs,
 * the swap is confined to this file.
 */

export type NetworkId = 'mtn' | 'airtel' | 'glo' | '9mobile';

/** Each carrier's own colours, not approximations chosen to match the app. */
export const NETWORK_BRAND: Record<NetworkId, { ground: string; ink: string }> = {
  mtn: { ground: '#FFCB05', ink: '#000000' },
  airtel: { ground: '#E40000', ink: '#FFFFFF' },
  glo: { ground: '#00B04F', ink: '#FFFFFF' },
  '9mobile': { ground: '#006F45', ink: '#FFFFFF' },
};

/**
 * What is set on each ground, and how big.
 *
 * 9mobile is the odd one: the full name will not fit legibly on a 30px tile,
 * and its mark is the numeral anyway. The carrier's full name is printed
 * directly beneath the tile in the picker, so nothing is left ambiguous.
 */
const WORDMARK: Record<NetworkId, { text: string; scale: number; tracking: number }> = {
  mtn: { text: 'MTN', scale: 0.31, tracking: -0.3 },
  airtel: { text: 'airtel', scale: 0.23, tracking: -0.4 },
  glo: { text: 'glo', scale: 0.31, tracking: -0.2 },
  '9mobile': { text: '9', scale: 0.5, tracking: -0.2 },
};

interface Props {
  network: string;
  /** Edge length in px. The wordmark scales with it. */
  size?: number;
}

export function NetworkLogo({ network, size = 30 }: Props) {
  const id = network.toLowerCase().trim();
  const brand = NETWORK_BRAND[id as NetworkId];

  // An unknown network gets a neutral tile rather than a crash or a wrong
  // brand. detectTelcoFromPrefix can only ever return one of the four, but
  // this component is reachable from stored transaction rows too, and those
  // carry whatever the provider wrote.
  if (!brand) {
    return (
      <View
        style={{ width: size, height: size, borderRadius: size * 0.3 }}
        className="bg-black/[0.06] dark:bg-white/[0.08] items-center justify-center"
      >
        <Text
          className="font-inter-bold text-slate-400 dark:text-white/40"
          style={{ fontSize: size * 0.4 }}
        >
          ?
        </Text>
      </View>
    );
  }

  return (
    <View style={{ width: size, height: size }}>
      {/* The ground, plus MTN's arcs — the only part of any of these four
          marks that is a shape rather than a word. The wordmarks are set as
          real text so they stay sharp and use the app's own Inter faces. */}
      <Svg width={size} height={size} viewBox="0 0 30 30">
        <Rect x={0} y={0} width={30} height={30} rx={9} fill={brand.ground} />

        {/* MTN's two arcs sit above and below the wordmark. */}
        {id === 'mtn' && (
          <>
            <Path
              d="M7 9.6c2.6-2.9 13.4-2.9 16 0"
              stroke={brand.ink}
              strokeWidth={1.4}
              strokeLinecap="round"
              fill="none"
            />
            <Path
              d="M7 20.4c2.6 2.9 13.4 2.9 16 0"
              stroke={brand.ink}
              strokeWidth={1.4}
              strokeLinecap="round"
              fill="none"
            />
          </>
        )}

      </Svg>

      {/*
        The wordmark, centred over the ground.

        Airtel gets its wordmark rather than its swoosh. The swoosh was tried
        and, hand-drawn at 30px, read as a headphone — and a single abstract
        glyph sitting among three wordmarks looks like a mistake rather than a
        set. Lowercase, because that is how Airtel sets its own name.
      */}
      <View className="absolute inset-0 items-center justify-center">
        {/* font-inter-bold, not extrabold: Inter_700Bold is the heaviest face
            App.tsx actually loads, and a class for a weight that is not loaded
            resolves to nothing and falls back to the system font. */}
        <Text
          className="font-inter-bold"
          style={{
            color: brand.ink,
            fontSize: WORDMARK[id as NetworkId].scale * size,
            letterSpacing: WORDMARK[id as NetworkId].tracking,
            includeFontPadding: false,
          }}
        >
          {WORDMARK[id as NetworkId].text}
        </Text>
      </View>
    </View>
  );
}
