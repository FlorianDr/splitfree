import type { Cents, Currency, Transfer } from "./types.ts";

interface Holder {
  contactId: string;
  amount: Cents;
}

/**
 * Up to this many nonzero balances in one currency, the plan is provably minimal (an exact search
 * over all 2^n subsets, ~1M at 20, a few tens of ms). Above it, largest-first matching alone.
 */
export const EXACT_SEARCH_LIMIT = 20;

/**
 * Turn per-currency net balances into the fewest transfers that settle everyone.
 *
 * For each currency independently:
 *   - Drop zero balances.
 *   - Split everyone into as many groups as possible whose balances sum to exactly zero (exact
 *     subset search, see `zeroSumGroups`). Each group settles on its own, so n people in k groups
 *     need n − k transfers, and no plan can do better: that is the minimum.
 *   - Settle each group by largest-first matching: repeatedly pick the largest creditor and the
 *     largest-magnitude debtor, move t = min(creditor, −debtor), and drop whoever reaches zero.
 *     Within a group with no smaller zero-sum part this takes exactly (size − 1) transfers.
 *
 * Without the grouping, largest-first matching can split a debtor across creditors needlessly, e.g.
 * after some settle payments are already made. Above EXACT_SEARCH_LIMIT the whole currency is one
 * group (still ≤ n−1 transfers). All math is in integer cents; transfers never cross currencies,
 * and ties are broken by contactId, so the same balances always give the same plan.
 */
export function simplifyDebts(
  net: Map<Currency, Map<string, Cents>>,
): Transfer[] {
  const transfers: Transfer[] = [];

  for (const [currency, balances] of net) {
    const holders: Holder[] = [];
    for (const [contactId, amount] of balances) {
      if (amount !== 0) holders.push({ contactId, amount });
    }
    holders.sort((a, b) => cmp(a.contactId, b.contactId));

    const groups = holders.length <= EXACT_SEARCH_LIMIT ? zeroSumGroups(holders) : [holders];
    for (const group of groups) settleGroup(currency, group, transfers);
  }

  return transfers;
}

/**
 * Partition `holders` (all nonzero, summing to 0) into the most groups that each sum to 0.
 *
 * best[m] is the most zero-sum masks on a chain that peels members off subset m one at a time
 * (counting m itself if it sums to 0). Along the best chain from everyone, consecutive zero-sum
 * masks differ by a zero-sum group, and best[everyone] is the number of groups. O(2^n · n).
 */
function zeroSumGroups(holders: Holder[]): Holder[][] {
  const n = holders.length;
  if (n === 0) return [];
  const full = (1 << n) - 1;
  const sum = new Float64Array(1 << n); // exact for any realistic total of integer cents
  const best = new Uint8Array(1 << n);
  // Typed-array reads below are always in range (masks ≤ full), hence the `!`.
  for (let m = 1; m <= full; m++) {
    const low = m & -m;
    sum[m] = sum[m ^ low]! + holders[31 - Math.clz32(low)]!.amount;
    let most = 0;
    for (let i = 0; i < n; i++) {
      if (m & (1 << i)) most = Math.max(most, best[m ^ (1 << i)]!);
    }
    best[m] = most + (sum[m] === 0 ? 1 : 0);
  }

  // Walk the chain back from everyone, peeling the lowest member that keeps the count; a group ends
  // each time the remainder sums to zero again.
  const groups: Holder[][] = [];
  let group: Holder[] = [];
  let m = full;
  while (m !== 0) {
    const need = best[m]! - (sum[m] === 0 ? 1 : 0);
    let i = 0;
    while (!(m & (1 << i)) || best[m ^ (1 << i)] !== need) i++;
    group.push(holders[i]!);
    m ^= 1 << i;
    if (sum[m] === 0) {
      groups.push(group);
      group = [];
    }
  }
  return groups;
}

/** Largest-first matching within one zero-sum group, appending to `transfers`. */
function settleGroup(currency: Currency, group: Holder[], transfers: Transfer[]): void {
  const creditors: Holder[] = [];
  const debtors: Holder[] = [];
  for (const h of group) {
    if (h.amount > 0) creditors.push({ ...h });
    else debtors.push({ ...h });
  }

  // Largest creditor first; largest-magnitude debtor first (most negative first).
  creditors.sort((a, b) => b.amount - a.amount || cmp(a.contactId, b.contactId));
  debtors.sort((a, b) => a.amount - b.amount || cmp(a.contactId, b.contactId));

  let ci = 0;
  let di = 0;
  // The group sums to 0, so creditors and debtors run out together. Each iteration zeroes at least
  // one holder, advancing a pointer, so we terminate after < size steps.
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

/** Lexicographic comparator used only to make ordering deterministic on ties. */
function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
