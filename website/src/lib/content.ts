import {
  Gauge,
  Hand,
  IdCard,
  KeyRound,
  Landmark,
  Lock,
  MapPin,
  MessageCircle,
  Receipt,
  Scan,
  ScanFace,
  ShieldCheck,
  Smartphone,
  Timer,
  TrendingUp,
  Tv,
  UserCheck,
  Wallet,
  Wifi,
  Zap,
  type LucideIcon,
} from "lucide-react";

/** Every word on the site, from the design handoff (MiliPay Website.dc.html). */

const tint = (c: string) => ({ bg: `${c}1F`, fg: c });

export interface Feature {
  icon: LucideIcon;
  title: string;
  body: string;
  bg: string;
  fg: string;
}

export const FEATURES: Feature[] = [
  { icon: Zap, title: "Pay bills", body: "Airtime, data, electricity and cable TV, with tokens kept in your receipts.", ...tint("#F97316") },
  { icon: Receipt, title: "See every payment", body: "Live status for each payment, and automatic refunds when a provider fails.", ...tint("#3B82F6") },
  { icon: Landmark, title: "Manage your banks", body: "Link up to 3 accounts and choose which one pays.", ...tint("#10B981") },
  { icon: Gauge, title: "Set your limits", body: "Pick your daily and per-payment limits, and when to ask for your PIN.", ...tint("#A855F7") },
  { icon: Hand, title: "Pause your palm", body: "Turn palm payments off and on whenever you like.", ...tint("#00C896") },
  { icon: MessageCircle, title: "Help any time", body: "Chat with our support team in the app, 24 hours a day.", ...tint("#E0A526") },
];

export const SERVICE_TILES = [
  { icon: Smartphone, label: "Airtime", ...tint("#10B981") },
  { icon: Wifi, label: "Data", ...tint("#3B82F6") },
  { icon: Zap, label: "Power", ...tint("#F97316") },
  { icon: Tv, label: "TV", ...tint("#A855F7") },
];

export const MOCK_TX = [
  { icon: Hand, title: "Lekki Fresh Mart", sub: "Palm · 10:42", amt: "−₦12,450", ...tint("#00C896") },
  { icon: Zap, title: "Ikeja Electric", sub: "Token sent · 9:15", amt: "−₦5,000", ...tint("#F97316") },
  { icon: Wifi, title: "MTN Data 1.5GB", sub: "Yesterday", amt: "−₦1,000", ...tint("#3B82F6") },
];

export const PALM_STEPS = [
  { n: "01", icon: Landmark, title: "Link your bank", body: "In the app, link your bank account through Mono's secure window. MiliPay never sees your bank login." },
  { n: "02", icon: Hand, title: "Add your palm", body: "Visit a MiliPay agent with your NIN. They scan your palm in about 5 minutes." },
  { n: "03", icon: Scan, title: "Hold it over the scanner", body: "At the till, hold your palm over the MiliPay terminal. The money comes from your bank and the receipt lands in your app." },
];

export const SECURITY = [
  { icon: Hand, title: "Palm vein, not a picture", body: "The scanner reads the pattern of veins under your skin, so it cannot be lifted from a glass or a photo." },
  { icon: Lock, title: "PIN for bigger payments", body: "Above the amount you choose, the terminal asks for your 4-digit PIN as well." },
  { icon: Gauge, title: "Limits you control", body: "Set your own daily and per-payment limits, and pause palm payments at any time." },
  { icon: KeyRound, title: "Never your bank login", body: "Banks are linked through Mono's secure window. We never ask for your bank username or password." },
  { icon: IdCard, title: "Checked against your NIN", body: "Every account is verified with NIMC, and your selfie is matched to your NIN photo." },
  { icon: UserCheck, title: "Only accounts in your name", body: "You can only link bank accounts whose name matches your NIN." },
];

export const SIGNUP_STEPS = [
  { n: 1, icon: Smartphone, title: "Your phone", body: "We text you a 6-digit code." },
  { n: 2, icon: IdCard, title: "Your NIN", body: "Your NIN and date of birth." },
  { n: 3, icon: ScanFace, title: "A quick selfie", body: "Matched to your NIN photo to confirm it’s you." },
  { n: 4, icon: MapPin, title: "Your address", body: "Your state, LGA and street." },
  { n: 5, icon: Lock, title: "Password and PIN", body: "Then turn on fingerprint unlock if you like." },
];

export interface Tier {
  tier: string;
  name: string;
  chip: string;
  how: string;
  per: string;
  day: string;
  perks: string[];
  style: "light" | "deep" | "soft";
}

export const TIERS: Tier[] = [
  { tier: "Tier 1", name: "Basic", chip: "Open in the app", how: "Open it yourself in the app with your phone, NIN and a selfie.", per: "₦50,000", day: "₦200,000", perks: ["Airtime, data, electricity and cable TV", "Link your bank accounts", "Receipts and payment history"], style: "light" },
  { tier: "Tier 2", name: "Palm", chip: "Most popular", how: "Visit a MiliPay agent with your NIN to add your palm.", per: "₦150,000", day: "₦500,000", perks: ["Everything in Basic", "Pay with your palm at MiliPay terminals", "Pause palm payments any time"], style: "deep" },
  { tier: "Tier 3", name: "Enterprise", chip: "Coming soon", how: "For people who need to pay more. Will need your BVN and a verified address.", per: "₦250,000", day: "₦1,000,000", perks: ["Everything in Palm", "Higher limits"], style: "soft" },
];

export const BIZ_BENEFITS = [
  { icon: Timer, title: "Faster checkout", body: "Customers pay with a wave of the hand. No cards to swipe or phones to unlock." },
  { icon: Landmark, title: "Paid from their bank", body: "Each payment comes straight from the customer’s linked bank account." },
  { icon: ShieldCheck, title: "Verified customers", body: "Every palm belongs to a person verified with their NIN." },
  { icon: Receipt, title: "Receipts for both sides", body: "The terminal prints a receipt and the customer gets one in their app." },
];

export const TILL_STEPS = [
  { n: "01", title: "Enter the amount", body: "Your cashier keys the total into the MiliPay terminal." },
  { n: "02", title: "Customer holds out their palm", body: "They hold their palm over the scanner. Bigger payments also need their PIN." },
  { n: "03", title: "MiliPay checks and pays", body: "We match the palm, check their limits and take the money from their bank." },
  { n: "04", title: "Done", body: "The terminal shows Paid and prints a receipt." },
];

export const BIZ_START = [
  { n: 1, title: "Apply", body: "Tell us about your business. It takes 3 minutes." },
  { n: 2, title: "We check your business", body: "We confirm your CAC registration and call you within 2 working days." },
  { n: 3, title: "We set you up", body: "We install your terminal and train your staff." },
  { n: 4, title: "Start taking palm payments", body: "Track your sales and settlements from your dashboard." },
];

export const AGENT_ROLE = [
  { icon: Hand, title: "Register palms", body: "Use the MiliPay agent app to check a customer's NIN and scan their palm." },
  { icon: TrendingUp, title: "Move people to Tier 2", body: "Help customers who signed up in the app unlock palm payments and higher limits." },
  { icon: Wallet, title: "Earn commission", body: "Get paid for every successful registration you complete." },
];

export const AGENT_REQ = [
  "Be 18 or older with a valid NIN",
  "Have a shop, kiosk or office people can find",
  "Have a smartphone with data",
  "Complete MiliPay agent training",
];

export const ABOUT_COLS = [
  { title: "What we do", body: "MiliPay links a person’s palm to their bank account. At any MiliPay terminal they can pay with their hand alone, and in the app they can pay bills, track payments and manage their banks." },
  { title: "Why it matters", body: "Cards get lost, phones run out of battery, and cash is hard to keep safe. A palm is always with you and belongs to only one person." },
  { title: "How we work", body: "Customers stay in control. They set their own limits, choose when a PIN is needed and can pause palm payments at any time. We never ask for bank logins." },
];

export const STACK = [
  { icon: Scan, title: "Palm vein terminals", body: "Scanners at the till read the vein pattern in the palm." },
  { icon: Landmark, title: "Open banking through Mono", body: "Customers link their banks through Mono’s secure window." },
  { icon: IdCard, title: "NIN checks with NIMC", body: "Every account is checked against the national identity database." },
  { icon: ScanFace, title: "Selfie checks by Smile ID", body: "Selfies are matched to the NIN photo, with a liveness check." },
];

export type FaqCat = "Account" | "Palm pay" | "Payments" | "Limits" | "Security" | "Business";
export const FAQ_CATS: ("All" | FaqCat)[] = ["All", "Account", "Palm pay", "Payments", "Limits", "Security", "Business"];

export const FAQS: { cat: FaqCat; q: string; a: string }[] = [
  { cat: "Account", q: "How do I open a MiliPay account?", a: "Download the app, tap Create an account and follow five steps: your phone number, your NIN, a quick selfie, your address, then a password and PIN. It takes about 5 minutes." },
  { cat: "Account", q: "What's the difference between Tier 1 and Tier 2?", a: "Tier 1 is the account you open in the app: up to ₦50,000 per payment and ₦200,000 a day for bills, airtime and data. Tier 2 adds palm payments and raises your limits to ₦150,000 per payment and ₦500,000 a day. You move to Tier 2 when an agent adds your palm." },
  { cat: "Account", q: "I forgot my password. What do I do?", a: 'In the app, open Me, then Change password, and tap "Forgot your current password?". We text a code to your phone and you set a new password.' },
  { cat: "Palm pay", q: "How do I add my palm?", a: "Visit any MiliPay agent with your NIN. The agent scans your palm on a MiliPay device. It takes about 5 minutes." },
  { cat: "Palm pay", q: "Where can I pay with my palm?", a: "At any shop with a MiliPay terminal at the till. Hold your palm over the scanner and the payment comes straight from your bank account." },
  { cat: "Palm pay", q: "What if the terminal doesn't recognise my palm?", a: "Hold your palm flat, about 5 cm above the scanner, until it beeps. If it still fails, ask the cashier to restart the terminal or chat with us in the app." },
  { cat: "Payments", q: "Where does the money come from?", a: "From the bank account you choose in the app. You can link up to 3 accounts and switch which one pays at any time." },
  { cat: "Payments", q: "My bill payment says pending. What happens now?", a: "Your bank has paid and we are waiting for the provider. Most complete within 30 minutes. If it fails, you get a full refund to your bank automatically." },
  { cat: "Limits", q: "Can I set my own limits?", a: "Yes. In the app, open Palm Pay to set a daily limit and a per-payment limit below your tier's maximum, and choose the amount above which the terminal asks for your PIN." },
  { cat: "Security", q: "Does MiliPay see my bank login?", a: "No. You link banks through Mono's secure window. MiliPay never asks for your bank username or password." },
  { cat: "Security", q: "Can I stop palm payments?", a: "Yes. Turn on Pause palm payments in the app at any time. Bills and app payments keep working." },
  { cat: "Business", q: "How do I get a MiliPay terminal?", a: "Apply on the Business page. Our team reviews your business and calls you within 2 working days to arrange installation and staff training." },
  { cat: "Business", q: "How do I become an agent?", a: "Apply on the Agents page. We call you to check your details and book your training." },
];

/** The four the home page previews. */
export const HOME_FAQS = [0, 1, 6, 9].map((i) => FAQS[i]);

/** Filter FAQs by category and a search across question and answer. */
export function filterFaqs(cat: "All" | FaqCat, query: string) {
  const q = query.trim().toLowerCase();
  return FAQS.filter((f) => (cat === "All" || f.cat === cat) && (!q || `${f.q} ${f.a}`.toLowerCase().includes(q)));
}
