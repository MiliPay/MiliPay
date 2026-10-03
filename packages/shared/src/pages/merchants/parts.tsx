import { Briefcase, Fuel, Pill as PillIcon, ShoppingBag, ShoppingCart, Store, Utensils, type LucideIcon } from "lucide-react";
import { categoryStyle } from "@milipay/shared/features/merchants/admin";

export { StatCard as StatTile } from "@milipay/shared/components/ui/StatCard";

const ICONS: Record<string, LucideIcon> = {
  "shopping-cart": ShoppingCart,
  utensils: Utensils,
  pill: PillIcon,
  fuel: Fuel,
  "shopping-bag": ShoppingBag,
  briefcase: Briefcase,
  store: Store,
};

/** The category square: its icon on a 14% tint of its colour. */
export function CategoryIcon({ category, size }: { category: string; size: 32 | 60 }) {
  const c = categoryStyle(category);
  const Icon = ICONS[c.icon] ?? Store;
  return (
    <div
      className="flex flex-none items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: size === 60 ? 16 : 9,
        background: `${c.color}24`, // the design's tint(colour, 14)
        color: c.color,
      }}
    >
      <Icon size={size === 60 ? 28 : 16} aria-hidden="true" />
    </div>
  );
}
