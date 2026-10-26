import type { Cents, Currency } from "./types.ts";

/** Add two integer cent amounts. */
export function addCents(a: Cents, b: Cents): Cents {
  return a + b;
}

/** Negate an integer cent amount. Normalizes -0 to 0. */
export function negate(a: Cents): Cents {
  return a === 0 ? 0 : -a;
}

/** Whether an amount is exactly zero. */
export function isZero(a: Cents): boolean {
  return a === 0;
}

/** Sum a list of integer cent amounts. Empty list sums to 0. */
export function sum(values: Cents[]): Cents {
  let total = 0;
  for (const value of values) {
    total += value;
  }
  return total;
}

/**
 * Format integer minor units as a localized currency string.
 *
 * The number of minor-unit digits varies per currency (EUR/USD have 2, JPY has
 * 0). Rather than hard-coding a table, we ask `Intl.NumberFormat` itself for the
 * currency's `maximumFractionDigits`, which is the minor-unit exponent. We then
 * divide the integer minor units by 10^exponent to recover the major-unit number
 * and format that. The same formatter instance is reused so the resolved options
 * and the produced string always agree.
 */
export function formatCents(
  amount: Cents,
  currency: Currency,
  locale?: string,
): string {
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  });
  const exponent = formatter.resolvedOptions().maximumFractionDigits ?? 0;
  const major = amount / 10 ** exponent;
  return formatter.format(major);
}
