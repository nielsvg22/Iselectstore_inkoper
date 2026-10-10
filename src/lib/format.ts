const eur = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const eur2 = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });

export function formatEuro(cents: number | null | undefined, decimals = false): string {
  if (cents == null || Number.isNaN(cents)) return "—";
  return (decimals ? eur2 : eur).format(cents / 100);
}

export function formatPct(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toLocaleString("nl-NL", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("nl-NL", { dateStyle: "medium", timeStyle: "short" });
}

export function timeAgo(d: Date | string | null | undefined, now = new Date()): string {
  if (!d) return "nooit";
  const s = Math.max(0, Math.round((now.getTime() - new Date(d).getTime()) / 1000));
  if (s < 60) return "zojuist";
  if (s < 3600) return `${Math.floor(s / 60)} min geleden`;
  if (s < 86400) return `${Math.floor(s / 3600)} uur geleden`;
  return `${Math.floor(s / 86400)} d geleden`;
}

export const eurosToCents = (v: number | string): number => Math.round(Number(v) * 100);
