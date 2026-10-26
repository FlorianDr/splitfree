import type { Cents, Currency, Transfer } from "./types.ts";

interface Holder {
  contactId: string;
  amount: Cents;
}

/**
 * Greedily simplify a set of per-currency net balances into a minimal-ish list
 * of transfers.
 *
 * For each currency independently:
 *   - Drop zero balances.
 *   - Split into creditors (net > 0, are owed money) and debtors (net < 0, owe).
 *   - Repeatedly pick the largest creditor and the largest-magnitude debtor,
 *     move t = min(creditor, −debtor) from debtor to creditor, and remove
 *     whichever side reaches zero.
 *
 * This settles everyone to exactly zero and emits at most n−1 transfers for n
 * nonzero balances (each transfer zeroes at least one party). All math is in
 * integer cents and transfers never cross currencies.
 */
export function simplifyDebts(
  net: Map<Currency, Map<string, Cents>>,
): Transfer[] {
  const transfers: Transfer[] = [];

  for (const [currency, balances] of net) {
    const creditors: Holder[] = [];
    const debtors: Holder[] = [];
    for (const [contactId, amount] of balances) {
      if (amount > 0) {
        creditors.push({ contactId, amount });
      } else if (amount < 0) {
        debtors.push({ contactId, amount });
      }
    }

    // Sort once descending by magnitude; we then walk with two pointers and only
    // re-insert the partially-settled holder, keeping ordering deterministic.
    // Largest creditor first.
    creditors.sort((a, b) => b.amount - a.amount || cmp(a.contactId, b.contactId));
    // Largest-magnitude debtor first (most negative first).
    debtors.sort((a, b) => a.amount - b.amount || cmp(a.contactId, b.contactId));

    let ci = 0;
    let di = 0;
    // Both lists are non-empty here (per-currency nets sum to 0, so any nonzero
    // net implies at least one creditor and one debtor). Each iteration zeroes at
    // least one holder, advancing a pointer, so we terminate after < n steps.
    for (
      let creditor = creditors[ci], debtor = debtors[di];
      creditor !== undefined && debtor !== undefined;
      creditor = creditors[ci], debtor = debtors[di]
    ) {
      const t = Math.min(creditor.amount, -debtor.amount);
      transfers.push({
        fromContactId: debtor.contactId,
        toContactId: creditor.contactId,
        currency,
        amountCents: t,
      });
      creditor.amount -= t;
      debtor.amount += t;
      if (creditor.amount === 0) {
        ci++;
      }
      if (debtor.amount === 0) {
        di++;
      }
    }
  }

  return transfers;
}

/** Lexicographic comparator used only to make ordering deterministic on ties. */
function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
