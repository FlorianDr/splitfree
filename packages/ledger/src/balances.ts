import type { BillInput, Cents, Currency, PaymentInput } from "./types.ts";

/** Add `delta` to the entry for `contactId` in a per-contact balance map. */
function bump(map: Map<string, Cents>, contactId: string, delta: Cents): void {
  map.set(contactId, (map.get(contactId) ?? 0) + delta);
}

/** Get (creating if absent) the per-contact map for a currency. */
function currencyMap(
  outer: Map<Currency, Map<string, Cents>>,
  currency: Currency,
): Map<string, Cents> {
  let inner = outer.get(currency);
  if (inner === undefined) {
    inner = new Map<string, Cents>();
    outer.set(currency, inner);
  }
  return inner;
}

/**
 * Compute each contact's net balance per currency.
 *
 * A contact's net is (total paid) − (total owed) across all bills, plus the
 * effect of settle-up payments. A positive net means the contact is owed money
 * overall; negative means they owe.
 *
 * For each bill participant: net += paidCents − owedCents.
 * For each payment: the payer's net += amountCents (they fronted money) and the
 * payee's net −= amountCents.
 *
 * For well-formed input (every bill's paid sums to its owed sum) the per-currency
 * net always sums to exactly 0.
 */
export function computeNetBalances(
  bills: BillInput[],
  payments: PaymentInput[],
): Map<Currency, Map<string, Cents>> {
  const net = new Map<Currency, Map<string, Cents>>();

  for (const bill of bills) {
    const inner = currencyMap(net, bill.currency);
    for (const p of bill.participants) {
      bump(inner, p.contactId, p.paidCents - p.owedCents);
    }
  }

  for (const pay of payments) {
    const inner = currencyMap(net, pay.currency);
    bump(inner, pay.fromContactId, pay.amountCents);
    bump(inner, pay.toContactId, -pay.amountCents);
  }

  return net;
}

/**
 * Compute pairwise friend balances between `meContactId` and every other contact,
 * per currency. A POSITIVE value for contact X means "X owes me"; negative means
 * "I owe X".
 *
 * Attribution model (deterministic):
 *
 * Within a single bill each person has a net n_i = paid_i − owed_i, and the nets
 * sum to 0. We attribute *my* net to the counterparties on the opposite side,
 * proportionally to their magnitude. Concretely, for each bill:
 *   - Let myNet = my (paid − owed) in this bill.
 *   - The "opposite side" are participants whose net has the opposite sign to
 *     myNet (if myNet > 0 they are the debtors; if myNet < 0 they are the
 *     creditors). Let S be the total magnitude of the opposite side.
 *   - I attribute to each opposite counterparty c a share
 *         share_c = myNet * (|net_c| / S)
 *     so that Σ share_c == myNet exactly. A positive myNet (I overpaid) yields
 *     positive shares → those counterparties owe me. A negative myNet yields
 *     negative shares → I owe them.
 *   - To keep totals exact in integer cents the shares are apportioned with the
 *     largest-remainder method over the opposite counterparties.
 *
 * Payments between me and another contact are applied directly: a payment I make
 * (I am `from`) reduces what I owe / increases what they owe me by amountCents;
 * a payment I receive (I am `to`) does the opposite. Payments not involving me
 * do not affect my pairwise balances.
 *
 * Note: the sum over counterparties of these pairwise balances equals my global
 * net per currency, but the individual pairwise figures are an attribution and
 * can differ from a different (equally valid) attribution before debt
 * simplification.
 */
export function computePairwiseBalances(
  meContactId: string,
  bills: BillInput[],
  payments: PaymentInput[],
): Map<string, Map<Currency, Cents>> {
  // result[otherContactId][currency] = amount they owe me (positive)
  const result = new Map<string, Map<Currency, Cents>>();

  const add = (other: string, currency: Currency, delta: Cents): void => {
    let inner = result.get(other);
    if (inner === undefined) {
      inner = new Map<Currency, Cents>();
      result.set(other, inner);
    }
    inner.set(currency, (inner.get(currency) ?? 0) + delta);
  };

  for (const bill of bills) {
    // Find my net in this bill (sum, in case I appear more than once).
    let myNet = 0;
    let iAmInBill = false;
    for (const p of bill.participants) {
      if (p.contactId === meContactId) {
        myNet += p.paidCents - p.owedCents;
        iAmInBill = true;
      }
    }
    if (!iAmInBill || myNet === 0) {
      continue;
    }

    // Collect opposite-side counterparties (excluding me) and their magnitudes.
    const wantPositiveNet = myNet < 0; // if I owe, opposite side are creditors
    const others: string[] = [];
    const magnitudes: number[] = [];
    let totalMagnitude = 0;
    for (const p of bill.participants) {
      if (p.contactId === meContactId) {
        continue;
      }
      const otherNet = p.paidCents - p.owedCents;
      const isOpposite = wantPositiveNet ? otherNet > 0 : otherNet < 0;
      if (isOpposite) {
        const mag = Math.abs(otherNet);
        others.push(p.contactId);
        magnitudes.push(mag);
        totalMagnitude += mag;
      }
    }
    if (totalMagnitude === 0) {
      // No opposite side to attribute to (degenerate bill); skip.
      continue;
    }

    // Apportion myNet across `others` proportionally to their magnitudes using
    // the largest-remainder method so the shares sum to exactly myNet.
    const shares = apportionSigned(myNet, magnitudes, totalMagnitude);
    for (let i = 0; i < others.length; i++) {
      add(others[i] ?? "", bill.currency, shares[i] ?? 0);
    }
  }

  for (const pay of payments) {
    if (pay.fromContactId === meContactId && pay.toContactId !== meContactId) {
      // I paid them: I reduce my debt to them / they now owe me more.
      add(pay.toContactId, pay.currency, pay.amountCents);
    } else if (
      pay.toContactId === meContactId &&
      pay.fromContactId !== meContactId
    ) {
      // They paid me: I owe them more / they owe me less.
      add(pay.fromContactId, pay.currency, -pay.amountCents);
    }
  }

  // Prune entries that netted to exactly zero so callers only see live balances.
  for (const [other, inner] of result) {
    for (const [currency, amount] of inner) {
      if (amount === 0) {
        inner.delete(currency);
      }
    }
    if (inner.size === 0) {
      result.delete(other);
    }
  }

  return result;
}

/**
 * Apportion a signed integer `total` across buckets in proportion to their
 * (non-negative) weights, returning integer shares that sum to exactly `total`.
 * Uses the largest-remainder method on |total| and re-applies the sign.
 */
function apportionSigned(
  total: number,
  weights: number[],
  sumWeights: number,
): number[] {
  const sign = total < 0 ? -1 : 1;
  const magnitude = Math.abs(total);

  const floors: number[] = [];
  const remainders: number[] = [];
  let allocated = 0;
  for (let i = 0; i < weights.length; i++) {
    const weight = weights[i] ?? 0;
    const scaled = magnitude * weight;
    const floor = Math.floor(scaled / sumWeights);
    floors[i] = floor;
    remainders[i] = scaled - floor * sumWeights;
    allocated += floor;
  }

  const leftover = magnitude - allocated;
  const order = weights.map((_, i) => i);
  order.sort((a, b) => {
    const ra = remainders[a] ?? 0;
    const rb = remainders[b] ?? 0;
    if (rb !== ra) {
      return rb - ra;
    }
    return a - b;
  });
  for (let k = 0; k < leftover; k++) {
    const idx = order[k] ?? 0;
    floors[idx] = (floors[idx] ?? 0) + 1;
  }

  return floors.map((f) => sign * f);
}
