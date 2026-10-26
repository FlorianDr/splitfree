/**
 * Reading typed amounts ("80,62", "80.62", "1.234,56", "1,234.56") in the user's locale. Isomorphic
 * on purpose (no `.server` suffix): the forms parse as you type, the payment action parses again on
 * the server with the locale the form sent along.
 *
 * Both "." and "," are accepted as the decimal point, because phone keyboards and copy-pasted
 * amounts don't always match the device locale. The locale only breaks ties: a lone separator that
 * isn't the locale's decimal point and is followed by exactly three digits ("1.234" in de, "1,234" in
 * en) is the locale's thousands separator — or, if the locale groups with something else (a space in
 * pl/cs), ambiguous and refused rather than guessed.
 */

export interface Separators {
  decimal: "." | ",";
  /** The locale's thousands separator, e.g. "," (en), "." (de), a no-break space (pl, cs). */
  group: string;
}

export const DEFAULT_SEPARATORS: Separators = { decimal: ".", group: "," };

/**
 * Separators for a BCP 47 locale ("de-DE"); en when the locale is missing, unknown or invalid (never
 * the runtime's default, so the server reads amounts the same way on every host).
 */
export function numberSeparators(locale: string | undefined): Separators {
  if (!locale) return DEFAULT_SEPARATORS;
  let parts: Intl.NumberFormatPart[];
  try {
    // 1234567.1, not 1234.1: some locales (pl, es) don't group four-digit numbers.
    parts = new Intl.NumberFormat(locale).formatToParts(1234567.1);
  } catch {
    return DEFAULT_SEPARATORS;
  }
  const decimal = parts.find((p) => p.type === "decimal")?.value === "," ? "," : ".";
  const group = parts.find((p) => p.type === "group")?.value ?? (decimal === "," ? "." : ",");
  return { decimal, group };
}

/** Spaces and apostrophes only ever group digits ("1 234,56", "1'234.50"), so they're dropped. */
const IGNORED = /[\s  '’]/g;

/**
 * Split an amount into its integer and fraction digits, or null if it can't be read unambiguously.
 * Blank reads as zero.
 */
function readDigits(input: string, seps: Separators): { int: string; frac: string } | null {
  const s = input.replace(IGNORED, "");
  if (s === "") return { int: "0", frac: "" };
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let decimal: "." | "," | null;
  if (lastDot >= 0 && lastComma >= 0) {
    // "1.234,56" / "1,234.56": whichever comes last is the decimal point.
    decimal = lastDot > lastComma ? "." : ",";
  } else if (lastDot < 0 && lastComma < 0) {
    decimal = null;
  } else {
    const sep = lastDot >= 0 ? "." : ",";
    if (s.indexOf(sep) !== s.lastIndexOf(sep)) {
      decimal = null; // "1.234.567": only thousands separators
    } else if (sep !== seps.decimal && /^[1-9]\d{0,2}[.,]\d{3}$/.test(s)) {
      if (sep !== seps.group) return null; // "1.000" in pl: 1000 or 1?
      decimal = null;
    } else {
      decimal = sep;
    }
  }

  let int = s;
  let frac = "";
  if (decimal) {
    const parts = s.split(decimal);
    if (parts.length !== 2) return null;
    [int, frac] = parts as [string, string];
    if (!/^\d*$/.test(frac)) return null;
  }
  const group = decimal ? (decimal === "." ? "," : ".") : s.includes(",") ? "," : ".";
  if (int.includes(group)) {
    if (!new RegExp(`^\\d{1,3}(\\${group}\\d{3})+$`).test(int)) return null;
    int = int.replaceAll(group, "");
  }
  if (!/^\d*$/.test(int) || (int === "" && frac === "")) return null;
  return { int: int || "0", frac };
}

/** A typed number (percent, shares), or null if it can't be read. Blank reads as 0. */
export function parseDecimal(input: string, seps: Separators = DEFAULT_SEPARATORS): number | null {
  const d = readDigits(input, seps);
  return d ? Number(`${d.int}.${d.frac || "0"}`) : null;
}

/**
 * A typed money amount as integer cents, or null if it can't be read or has more than two decimals.
 * Built from the digit strings, never via float multiplication. Every currency the forms offer has
 * two minor-unit digits. Blank reads as 0.
 */
export function parseCents(input: string, seps: Separators = DEFAULT_SEPARATORS): number | null {
  const d = readDigits(input, seps);
  if (!d) return null;
  const frac = d.frac.replace(/0+$/, "");
  if (frac.length > 2) return null;
  const cents = Number(d.int) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** An example amount in the locale's format, for placeholders and error hints ("1234,56"). */
export function exampleAmount(seps: Separators): string {
  return `1234${seps.decimal}56`;
}
