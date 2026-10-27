/**
 * IBAN checks for the bank details people enter in settings. Isomorphic on purpose (no `.server`
 * suffix): the settings form checks as you type, the action checks again on the server.
 *
 * Only SEPA countries are accepted, because splitfree settles up with SEPA transfers (and Wero, which
 * runs on them). Lengths are from the SWIFT IBAN registry; the country list is the EPC's "List of SEPA
 * Scheme Countries" (v8.0, December 2025: EU, EEA, and 11 others). Overseas territories that bank in
 * a SEPA country (Åland, Guernsey, Réunion, …) use that country's IBAN prefix, so they're covered.
 */

const SEPA_IBAN_LENGTHS: Readonly<Record<string, number>> = {
  // EU
  AT: 20, BE: 16, BG: 22, CY: 28, CZ: 24, DE: 22, DK: 18, EE: 20, ES: 24, FI: 18, FR: 27, GR: 27,
  HR: 21, HU: 28, IE: 22, IT: 27, LT: 20, LU: 20, LV: 21, MT: 31, NL: 18, PL: 28, PT: 25, RO: 24,
  SE: 24, SI: 19, SK: 24,
  // EEA
  IS: 26, LI: 21, NO: 15,
  // Others
  AD: 24, AL: 28, CH: 21, GB: 22, GI: 23, MC: 27, MD: 24, ME: 22, MK: 19, RS: 22, SM: 27, VA: 22,
};

export type IbanResult = { ok: true; iban: string } | { ok: false; error: string };

/** Uppercase, without spaces and without a leading "IBAN" label ("IBAN: DE89 3704 …"). */
export function normalizeIban(input: string): string {
  return input
    .replace(/\s+/g, "")
    .toUpperCase()
    .replace(/^IBAN:?/, "");
}

/** The paper format: groups of four ("DE89 3704 0044 0532 0130 00"). */
export function formatIban(iban: string): string {
  return normalizeIban(iban).replace(/(.{4})(?=.)/g, "$1 ");
}

/** ISO 7064 mod 97-10, the IBAN check digits: the rearranged number mod 97 must be 1. */
function checksumOk(iban: string): boolean {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    // A=10 … Z=35; feed digit by digit so the number never outgrows a double.
    const value = ch >= "A" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const digit of value) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

export function validateIban(input: string): IbanResult {
  const iban = normalizeIban(input);
  if (iban === "") return { ok: false, error: "Enter an IBAN." };
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) {
    return { ok: false, error: "An IBAN starts with two letters and two digits, then letters and digits only." };
  }
  const country = iban.slice(0, 2);
  const length = SEPA_IBAN_LENGTHS[country];
  if (length === undefined) {
    return { ok: false, error: "Only IBANs from SEPA countries can be paid with a SEPA transfer." };
  }
  if (iban.length !== length) {
    return { ok: false, error: `A ${country} IBAN has ${length} characters, this one has ${iban.length}.` };
  }
  if (!checksumOk(iban)) {
    return { ok: false, error: "This IBAN has a typo: its check digits don't match." };
  }
  return { ok: true, iban };
}

/** Longest name a SEPA transfer (and the EPC QR code) carries. */
export const ACCOUNT_HOLDER_MAX = 70;

export type AccountHolderResult = { ok: true; name: string } | { ok: false; error: string };

/**
 * The name that goes with an IBAN (the person's display name). The payer's bank compares it with
 * the IBAN (Verification of Payee) and warns the payer when they don't match.
 */
export function validateAccountHolder(input: string): AccountHolderResult {
  const name = input.trim().replace(/\s+/g, " ");
  if (name === "") return { ok: false, error: "Enter the name on your bank account to add an IBAN." };
  if (name.length > ACCOUNT_HOLDER_MAX) {
    return { ok: false, error: `With an IBAN, the name can have at most ${ACCOUNT_HOLDER_MAX} characters.` };
  }
  if (/\p{Cc}/u.test(name)) return { ok: false, error: "The name has invalid characters." };
  return { ok: true, name };
}
