/**
 * Self sign-up's words and rules on the phone (design handoff, "Self sign-up
 * (Tier 1)"). Pure, so the test suite runs exactly this. The server decides
 * everything that matters; this only shapes what the screens show.
 */

export type SignupStage = 'phone' | 'code' | 'nin' | 'selfie' | 'selfieFail' | 'confirm' | 'addr' | 'review';

/** "Step N of 5" (the prototype's SU_STEP). */
export const SU_STEP: Record<SignupStage, number> = {
  phone: 1,
  code: 1,
  nin: 2,
  selfie: 3,
  selfieFail: 3,
  review: 3,
  confirm: 3,
  addr: 4,
};

/** Where Back goes from each step (the prototype's suBack). null: to Welcome. */
export const SU_BACK: Record<SignupStage, SignupStage | null> = {
  phone: null,
  code: 'phone',
  nin: 'phone',
  selfie: 'nin',
  selfieFail: 'selfie',
  confirm: 'selfie',
  addr: 'confirm',
  review: null,
};

/** The 5-part bar: the first `step` parts lit. */
export function barFilled(step: number): boolean[] {
  return [1, 2, 3, 4, 5].map((i) => i <= step);
}

/** "1234 567 8901" as it is typed. */
export function fmtNin(digits: string): string {
  return [digits.slice(0, 4), digits.slice(4, 7), digits.slice(7)].filter(Boolean).join(' ');
}

export function ninDigits(input: string): string {
  return input.replace(/[^0-9]/g, '').slice(0, 11);
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface Dob {
  d: number;
  m: number; // 0–11
  y: number;
}

/** "14 Mar 1994", or the field's placeholder. */
export function dobLabel(dob: Dob | null): string {
  return dob ? `${dob.d} ${MONTHS[dob.m]} ${dob.y}` : 'Choose a date';
}

/** "1994-03-14", what the server takes. */
export function dobIso(dob: Dob): string {
  return `${dob.y}-${String(dob.m + 1).padStart(2, '0')}-${String(dob.d).padStart(2, '0')}`;
}

export function dobFromIso(iso: string | null | undefined): Dob | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) } : null;
}

/** The picker's years: the design's 2008 down to 1940. */
export const DOB_YEARS = Array.from({ length: 69 }, (_, i) => 2008 - i);

/** Day clamped to the month (31 Feb becomes 28 or 29), as the prototype's dobDone does. */
export function clampDob(dob: Dob): Dob {
  const max = new Date(dob.y, dob.m + 1, 0).getDate();
  return { ...dob, d: Math.min(dob.d, max) };
}

export function ninReady(nin: string, dob: Dob | null, consent: boolean): boolean {
  return nin.length === 11 && !!dob && consent;
}

export const PHONE_RE = /^0[789][01]\d{8}$/;

export const STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 'Cross River', 'Delta', 'Ebonyi',
  'Edo', 'Ekiti', 'Enugu', 'FCT (Abuja)', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi',
  'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba',
  'Yobe', 'Zamfara',
];

/** LGAs the app can list. For any other state the customer types theirs. */
export const LGAS: Record<string, string[]> = {
  Lagos: ['Agege', 'Ajeromi-Ifelodun', 'Alimosho', 'Amuwo-Odofin', 'Apapa', 'Badagry', 'Epe', 'Eti-Osa', 'Ibeju-Lekki', 'Ifako-Ijaiye', 'Ikeja', 'Ikorodu', 'Kosofe', 'Lagos Island', 'Lagos Mainland', 'Mushin', 'Ojo', 'Oshodi-Isolo', 'Shomolu', 'Surulere'],
  'FCT (Abuja)': ['Abaji', 'Abuja Municipal (AMAC)', 'Bwari', 'Gwagwalada', 'Kuje', 'Kwali'],
  Ogun: ['Abeokuta North', 'Abeokuta South', 'Ado-Odo/Ota', 'Ewekoro', 'Ifo', 'Ijebu East', 'Ijebu North', 'Ijebu North East', 'Ijebu Ode', 'Ikenne', 'Imeko Afon', 'Ipokia', 'Obafemi Owode', 'Odeda', 'Odogbolu', 'Ogun Waterside', 'Remo North', 'Sagamu', 'Yewa North', 'Yewa South'],
  Rivers: ['Abua/Odual', 'Ahoada East', 'Ahoada West', 'Akuku-Toru', 'Andoni', 'Asari-Toru', 'Bonny', 'Degema', 'Eleme', 'Emohua', 'Etche', 'Gokana', 'Ikwerre', 'Khana', 'Obio/Akpor', 'Ogba/Egbema/Ndoni', 'Ogu/Bolo', 'Okrika', 'Omuma', 'Opobo/Nkoro', 'Oyigbo', 'Port Harcourt', 'Tai'],
};

export function filterStates(query: string): string[] {
  const q = query.trim().toLowerCase();
  return q ? STATES.filter((s) => s.toLowerCase().includes(q)) : STATES;
}

export function addressReady(state: string, lga: string, street: string): boolean {
  return !!state && lga.trim().length >= 2 && street.trim().length >= 5;
}

export const SELFIE_TIPS = [
  { icon: 'sun', label: 'Good light, face the light' },
  { icon: 'glasses', label: 'Remove glasses, caps or masks' },
  { icon: 'smartphone', label: 'Hold the phone at eye level' },
] as const;

export const NIN_DATA_ROWS = [
  { icon: 'shield-check', text: 'We send your NIN, date of birth and selfie to NIMC through our partner Smile ID, only to confirm who you are.' },
  { icon: 'id-card', text: 'We keep your name, date of birth and NIN photo on your MiliPay account.' },
  { icon: 'lock', text: 'We never sell your data or share it for marketing.' },
] as const;

export const FAIL_REASONS: Record<string, string> = {
  'nin-mismatch': "Your NIN details didn't match.",
  'face-unclear': "Your face wasn't clear enough.",
};

export function triesLeft(n: number): string {
  return `${n} ${n === 1 ? 'try' : 'tries'} left`;
}

/** "AO" from the NIMC name, for the "Is this you?" circle. */
export function initialsOf(first: string | null | undefined, last: string | null | undefined): string {
  return ((first?.[0] ?? '') + (last?.[0] ?? '')).toUpperCase() || '•';
}

/** Tier 1 copy across the app (Home, Palm, Account limits, Me). */
export const TIER_NAME: Record<number, string> = { 1: 'Tier 1', 2: 'Tier 2', 3: 'Tier 3' };

export function tierHeroSub(tier: number): string {
  return tier === 1 ? 'Phone, NIN and selfie verified' : 'NIN and palm vein confirmed';
}
