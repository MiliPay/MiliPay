import React from 'react';
import { Image, ScrollView } from 'react-native';
import type { Promo } from '../../lib/promos';

const WIDTH = 350;
const GAP = 12;

/** Home's promo banners: 350×100, radius 20, snapping one at a time. Nothing when there are none. */
export function PromoCarousel({ promos }: { promos: Promo[] }) {
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
          style={{ width: WIDTH, height: 100, borderRadius: 20 }}
        />
      ))}
    </ScrollView>
  );
}
