/**
 * Single source of truth for ALLAL money presentation (mobile).
 *
 * Product-wide standard (one money language across the whole ALLAL ecosystem):
 *   - always two decimals, even for whole numbers
 *   - space thousands-grouping, dot decimal
 *   - "DZD" suffix
 *
 *   250        -> "250.00 DZD"
 *   4000       -> "4 000.00 DZD"
 *   125000.5   -> "125 000.50 DZD"
 *
 * Locale-independent on purpose: fr-DZ natively renders a comma decimal, so we
 * build the string explicitly to pin dot-decimal + space-grouping.
 */
export const CURRENCY = "DZD";

export function formatMoney(amount: number | string | null | undefined, currency: string = CURRENCY): string {
  const v = typeof amount === "string" ? parseFloat(amount) : Number(amount ?? 0);
  const safe = Number.isFinite(v) ? v : 0;
  const neg = safe < 0;
  const [intPart, dec] = Math.abs(safe).toFixed(2).split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${neg ? "-" : ""}${grouped}.${dec} ${currency}`;
}
