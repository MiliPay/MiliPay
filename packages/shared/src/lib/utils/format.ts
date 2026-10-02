export function formatNaira(
  amount: number | string,
  options?: { showDecimals?: boolean }
): string {
  const num = typeof amount === "string" ? parseFloat(amount) : Number(amount);
  const naira = isNaN(num) ? 0 : num;
  const showDecimals = options?.showDecimals ?? (naira % 1 !== 0);

  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(naira);
}

export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat("en-NG", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function maskId(value: string): string {
  if (value.length < 4) return "****";
  return `****${value.slice(-4)}`;
}

export function lastFour(value: string): string {
  return value.slice(-4);
}

/** Whole naira with no kobo: ₦12,450. */
export function formatNairaWhole(amount: number | string): string {
  const n = Number(amount);
  return "₦" + Math.round(isNaN(n) ? 0 : n).toLocaleString("en-NG");
}

/** Short naira for tiles and charts: ₦950, ₦12.4K, ₦3.2M, ₦1.20B. */
export function formatNairaCompact(amount: number | string): string {
  const n = Number(amount);
  const v = isNaN(n) ? 0 : n;
  const a = Math.abs(v);
  if (a >= 1e9) return "₦" + (v / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return "₦" + (v / 1e6).toFixed(1) + "M";
  if (a >= 1e3) return "₦" + (v / 1e3).toFixed(1) + "K";
  return formatNairaWhole(v);
}

/** How long ago: "just now", "5m ago", "3h ago", "2d ago". */
export function timeAgo(iso: string | Date | null | undefined, now: number = Date.now()): string {
  if (!iso) return "—";
  const t = typeof iso === "string" ? Date.parse(iso) : iso.getTime();
  if (isNaN(t)) return "—";
  const m = Math.max(0, (now - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${Math.round(m)}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
}

/** Initials from a name: "Adaeze Okafor" → "AO". */
export function initials(name: string | null | undefined): string {
  return (name || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
