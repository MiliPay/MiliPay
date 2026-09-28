import React from 'react';
import { Image, ScrollView, useWindowDimensions } from 'react-native';
import type { Promo } from '../../lib/promos';

const GAP = 12;

/**
 * Home's promo banners: 350×100 on the design's 390 pt phone (20 pt each
 * side), radius 20, snapping one at a time — sized to the screen with the
 * same margins and shape. Nothing when there are none.
 */
export function PromoCarousel({ promos }: { promos: Promo[] }) {
  const { width: screen } = useWindowDimensions();
  const WIDTH = Math.round(Math.min(screen - 40, 520));
  if (promos.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToInterval={WIDTH + GAP}
      decelerationRate="fast"
      contentContainerStyle={{ gap: GAP, paddingHorizontal: 20, paddingTop: 14 }}
    >
      {promos.map((p) => (
        <Image
          key={p.id}
          source={p.image}
          accessibilityLabel={p.label}
          resizeMode="cover"
          style={{ width: WIDTH, height: Math.round((WIDTH * 100) / 350), borderRadius: 20 }}
        />
      ))}
    </ScrollView>
  );
}
