export function formatNaira(amountKobo: number): string {
  const naira = amountKobo / 100;
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: naira % 1 === 0 ? 0 : 2,
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