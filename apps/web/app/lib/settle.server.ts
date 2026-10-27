import { simplifyDebts, type Cents, type Currency, type Transfer } from "@splitfree/ledger";
import { getNetBalances, listSettleCircle } from "~/lib/db/queries.server";

/**
 * My part of the settle-up plan: the transfers I make or receive. The plan is simplified over my
 * whole circle (CLAUDE.md), but each person only ever sees their own transfers, so the rest of the
 * circle's debts and payment details stay private.
 */
export function mySettleTransfers(meId: string): Transfer[] {
  return simplifyDebts(getNetBalances(listSettleCircle(meId))).filter(
    (t) => t.fromContactId === meId || t.toContactId === meId,
  );
}

/** My simplified balance with each counterparty, per currency: positive = they pay me. */
export function simplifiedBalances(meId: string): Map<string, Map<Currency, Cents>> {
  const out = new Map<string, Map<Currency, Cents>>();
  for (const t of mySettleTransfers(meId)) {
    const theyPayMe = t.toContactId === meId;
    const other = theyPayMe ? t.fromContactId : t.toContactId;
    let inner = out.get(other);
    if (inner === undefined) out.set(other, (inner = new Map()));
    inner.set(t.currency, (inner.get(t.currency) ?? 0) + (theyPayMe ? t.amountCents : -t.amountCents));
  }
  return out;
}
