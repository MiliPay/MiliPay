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
  if (value.length < 4) return "••••";
  return `••••${value.slice(-4)}`;
}

export function lastFour(value: string): string {
  return value.slice(-4);
}