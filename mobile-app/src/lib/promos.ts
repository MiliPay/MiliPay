import type { ImageSourcePropType } from 'react-native';

export interface Promo {
  id: string;
  /** 700×200 artwork (drawn at 350×100). */
  image: ImageSourcePropType;
  /** What the banner says, for screen readers. */
  label: string;
}

/**
 * Home's promo banners (design handoff, screen 5). The design ships only
 * grey "PROMO BANNER" placeholders and says the artwork is still to come, so
 * the list is empty and Home draws no carousel. Add an entry with its image
 * (e.g. `require('../../assets/promos/cashback.png')`) and it appears.
 */
export const PROMOS: Promo[] = [];
