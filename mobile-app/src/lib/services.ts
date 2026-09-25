import {
  Smartphone,
  Wifi,
  Lightbulb,
  Tv,
  Globe,
  Bus,
  GraduationCap,
  Droplet,
  Plane,
  HeartPulse,
  Ticket,
  Landmark,
  type LucideIcon,
} from 'lucide-react-native';

/**
 * The four services the platform can actually deliver.
 *
 * This list is not decorative — it must stay identical to the zod enum in
 * supabase/functions/vtu-service/index.ts, which is the last word on what the
 * server will accept:
 *
 *     serviceType: z.enum(["airtime", "data", "power", "cable"])
 *
 * Anything else is a 400 the customer sees as "something went wrong".
 */
export type ServiceType = 'airtime' | 'data' | 'power' | 'cable';

export interface ServiceTile {
  key: string;
  label: string;
  icon: LucideIcon;
  /**
   * What the server is asked for. `null` means we cannot deliver this yet, and
   * the tile must not navigate anywhere.
   */
  service: ServiceType | null;
  group: 'topup' | 'bills' | 'lifestyle';
}

/**
 * Every tile the app shows, in one place, so the home row and the full sheet
 * can never drift apart.
 *
 * Before this, the two lists disagreed with each other and both disagreed with
 * the server. The home row offered Internet, Transport and Education — none of
 * which the server accepts — and in the full sheet, Water and Taxes opened the
 * electricity form, Movies opened Cable TV, Health opened Education, and
 * Flights opened a service that does not exist. Of twelve advertised services,
 * four worked, three returned an error, and five quietly opened something else.
 *
 * Tiles with `service: null` render as unavailable rather than being removed,
 * so the roadmap is still visible without the app pretending to sell something
 * it cannot deliver.
 */
export const SERVICE_TILES: ServiceTile[] = [
  { key: 'airtime', label: 'Airtime', icon: Smartphone, service: 'airtime', group: 'topup' },
  { key: 'data', label: 'Data', icon: Wifi, service: 'data', group: 'topup' },
  { key: 'power', label: 'Electricity', icon: Lightbulb, service: 'power', group: 'bills' },
  { key: 'cable', label: 'Cable TV', icon: Tv, service: 'cable', group: 'bills' },

  // Planned. No provider is wired to any of these yet: VTPass, the gateway,
  // covers airtime, data, cable and electricity and nothing more.
  { key: 'internet', label: 'Internet', icon: Globe, service: null, group: 'bills' },
  { key: 'water', label: 'Water', icon: Droplet, service: null, group: 'bills' },
  { key: 'taxes', label: 'Taxes', icon: Landmark, service: null, group: 'bills' },
  { key: 'education', label: 'Education', icon: GraduationCap, service: null, group: 'lifestyle' },
  { key: 'transport', label: 'Transport', icon: Bus, service: null, group: 'lifestyle' },
  { key: 'movies', label: 'Movies', icon: Ticket, service: null, group: 'lifestyle' },
  { key: 'flights', label: 'Flights', icon: Plane, service: null, group: 'lifestyle' },
  { key: 'health', label: 'Health', icon: HeartPulse, service: null, group: 'lifestyle' },
];

/** The ones that work. */
export const AVAILABLE_SERVICES = SERVICE_TILES.filter(
  (tile): tile is ServiceTile & { service: ServiceType } => tile.service !== null,
);

/**
 * The home screen's shortcut row — four, not "however many work".
 *
 * That row is a fixed five squares wide: these four plus the tile that opens
 * the full sheet. Feeding it every available service would silently break the
 * layout the day a planned service goes live, and the home screen is a
 * shortcut anyway — the sheet is the catalogue.
 */
export const HOME_ROW_SERVICES = AVAILABLE_SERVICES.slice(0, 4);

export const SERVICE_GROUPS: { id: ServiceTile['group']; title: string }[] = [
  { id: 'topup', title: 'Top up' },
  { id: 'bills', title: 'Bills and utilities' },
  { id: 'lifestyle', title: 'Lifestyle' },
];
