/**
 * Shared domain types for the pure money-math ledger.
 *
 * Money is always represented as integer minor units ("cents"). For a 2-decimal
 * currency like EUR that means euro-cents; for a 0-decimal currency like JPY it
 * is whole yen. No floating point is ever used to *store* money.
 */

/** Integer minor units of a currency (e.g. euro-cents). Must be a safe integer. */
export type Cents = number;

/** ISO 4217 currency code, e.g. "EUR", "USD", "JPY". */
export type Currency = string;

/** How a bill's total is divided among its participants. */
export type SplitMode = "equal" | "exact" | "percent" | "shares";

/** One participant's contribution to a single bill. */
export interface BillParticipantInput {
  contactId: string;
  /** What this participant actually paid towards the bill. */
  paidCents: Cents;
  /** What this participant is responsible for (their share). */
  owedCents: Cents;
}

/** A single bill / expense in one currency. */
export interface BillInput {
  currency: Currency;
  participants: BillParticipantInput[];
}

/** A direct settle-up payment from one contact to another. */
export interface PaymentInput {
  currency: Currency;
  fromContactId: string;
  toContactId: string;
  amountCents: Cents;
}

/** A single money movement produced by debt simplification. */
export interface Transfer {
  fromContactId: string;
  toContactId: string;
  currency: Currency;
  amountCents: Cents;
}
