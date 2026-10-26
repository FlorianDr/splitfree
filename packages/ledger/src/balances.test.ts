import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeNetBalances,
  computePairwiseBalances,
} from "./balances.ts";
import type { BillInput, PaymentInput } from "./types.ts";

function sumMap(m: Map<string, number>): number {
  let t = 0;
  for (const v of m.values()) {
    t += v;
  }
  return t;
}

test("net: single 3-way equal bill with one payer", () => {
  // a paid 900, everyone owes 300.
  const bills: BillInput[] = [
    {
      currency: "EUR",
      participants: [
        { contactId: "a", paidCents: 900, owedCents: 300 },
        { contactId: "b", paidCents: 0, owedCents: 300 },
        { contactId: "c", paidCents: 0, owedCents: 300 },
      ],
    },
  ];
  const net = computeNetBalances(bills, []);
  const eur = net.get("EUR");
  assert.ok(eur);
  assert.equal(eur.get("a"), 600);
  assert.equal(eur.get("b"), -300);
  assert.equal(eur.get("c"), -300);
  assert.equal(sumMap(eur), 0);
});

test("net: multi-payer bill sums to 0", () => {
  const bills: BillInput[] = [
    {
      currency: "USD",
      participants: [
        { contactId: "a", paidCents: 600, owedCents: 400 },
        { contactId: "b", paidCents: 400, owedCents: 400 },
        { contactId: "c", paidCents: 200, owedCents: 400 },
      ],
    },
  ];
  const net = computeNetBalances(bills, []);
  const usd = net.get("USD");
  assert.ok(usd);
  assert.equal(usd.get("a"), 200);
  assert.equal(usd.get("b"), 0);
  assert.equal(usd.get("c"), -200);
  assert.equal(sumMap(usd), 0);
});

test("net: bill plus settling payment -> all zero", () => {
  const bills: BillInput[] = [
    {
      currency: "EUR",
      participants: [
        { contactId: "a", paidCents: 1000, owedCents: 500 },
        { contactId: "b", paidCents: 0, owedCents: 500 },
      ],
    },
  ];
  // b owes a 500; b pays a 500 to settle.
  const payments: PaymentInput[] = [
    { currency: "EUR", fromContactId: "b", toContactId: "a", amountCents: 500 },
  ];
  const net = computeNetBalances(bills, payments);
  const eur = net.get("EUR");
  assert.ok(eur);
  assert.equal(eur.get("a"), 0);
  assert.equal(eur.get("b"), 0);
});

test("net: two currencies independent, each sums to 0", () => {
  const bills: BillInput[] = [
    {
      currency: "EUR",
      participants: [
        { contactId: "a", paidCents: 100, owedCents: 50 },
        { contactId: "b", paidCents: 0, owedCents: 50 },
      ],
    },
    {
      currency: "USD",
      participants: [
        { contactId: "a", paidCents: 0, owedCents: 70 },
        { contactId: "b", paidCents: 140, owedCents: 70 },
      ],
    },
  ];
  const net = computeNetBalances(bills, []);
  const eur = net.get("EUR");
  const usd = net.get("USD");
  assert.ok(eur);
  assert.ok(usd);
  assert.equal(sumMap(eur), 0);
  assert.equal(sumMap(usd), 0);
  assert.equal(eur.get("a"), 50);
  assert.equal(usd.get("b"), 70);
});

test("net: payment direction increases payer, decreases payee", () => {
  const payments: PaymentInput[] = [
    { currency: "EUR", fromContactId: "x", toContactId: "y", amountCents: 300 },
  ];
  const net = computeNetBalances([], payments);
  const eur = net.get("EUR");
  assert.ok(eur);
  assert.equal(eur.get("x"), 300);
  assert.equal(eur.get("y"), -300);
  assert.equal(sumMap(eur), 0);
});

test("pairwise: simple 2-person bill - they owe me", () => {
  // I (me) paid 1000, we each owe 500. b owes me 500.
  const bills: BillInput[] = [
    {
      currency: "EUR",
      participants: [
        { contactId: "me", paidCents: 1000, owedCents: 500 },
        { contactId: "b", paidCents: 0, owedCents: 500 },
      ],
    },
  ];
  const pw = computePairwiseBalances("me", bills, []);
  assert.equal(pw.get("b")?.get("EUR"), 500);
});

test("pairwise: simple 2-person bill - I owe them", () => {
  const bills: BillInput[] = [
    {
      currency: "EUR",
      participants: [
        { contactId: "me", paidCents: 0, owedCents: 500 },
        { contactId: "b", paidCents: 1000, owedCents: 500 },
      ],
    },
  ];
  const pw = computePairwiseBalances("me", bills, []);
  assert.equal(pw.get("b")?.get("EUR"), -500);
});

test("pairwise: direct payment flips balance", () => {
  // b owes me 500 from a bill; then b pays me 500.
  const bills: BillInput[] = [
    {
      currency: "EUR",
      participants: [
        { contactId: "me", paidCents: 1000, owedCents: 500 },
        { contactId: "b", paidCents: 0, owedCents: 500 },
      ],
    },
  ];
  const payments: PaymentInput[] = [
    { currency: "EUR", fromContactId: "b", toContactId: "me", amountCents: 500 },
  ];
  const pw = computePairwiseBalances("me", bills, payments);
  // bill: +500, payment to me: -500 => net 0, entry omitted.
  assert.equal(pw.get("b"), undefined);
});

test("pairwise: payment I make to them increases what they owe me", () => {
  const payments: PaymentInput[] = [
    { currency: "EUR", fromContactId: "me", toContactId: "b", amountCents: 250 },
  ];
  const pw = computePairwiseBalances("me", [], payments);
  assert.equal(pw.get("b")?.get("EUR"), 250);
});

test("pairwise: proportional attribution across multiple counterparties", () => {
  // me overpaid by 900; b owes 300, c owes 600 within the bill.
  // attribution proportional to magnitudes 300:600 -> 300 and 600.
  const bills: BillInput[] = [
    {
      currency: "EUR",
      participants: [
        { contactId: "me", paidCents: 1200, owedCents: 300 },
        { contactId: "b", paidCents: 0, owedCents: 300 },
        { contactId: "c", paidCents: 0, owedCents: 600 },
      ],
    },
  ];
  const pw = computePairwiseBalances("me", bills, []);
  assert.equal(pw.get("b")?.get("EUR"), 300);
  assert.equal(pw.get("c")?.get("EUR"), 600);
  // pairwise sum equals my global net.
  const total = (pw.get("b")?.get("EUR") ?? 0) + (pw.get("c")?.get("EUR") ?? 0);
  assert.equal(total, 900);
});

test("pairwise: my net attributed with largest-remainder when not divisible", () => {
  // me overpaid by 100, two opposite parties of equal magnitude.
  const bills: BillInput[] = [
    {
      currency: "EUR",
      participants: [
        { contactId: "me", paidCents: 101, owedCents: 1 },
        { contactId: "b", paidCents: 0, owedCents: 50 },
        { contactId: "c", paidCents: 0, owedCents: 50 },
      ],
    },
  ];
  const pw = computePairwiseBalances("me", bills, []);
  const b = pw.get("b")?.get("EUR") ?? 0;
  const c = pw.get("c")?.get("EUR") ?? 0;
  assert.equal(b + c, 100);
  assert.deepEqual([b, c], [50, 50]);
});

test("pairwise: uneven magnitudes force largest-remainder leftover", () => {
  // me overpaid by 100; opposite parties have magnitudes 1 and 2 (sum 3).
  // ideal shares 33.33 and 66.67 -> floors 33, 66, leftover 1 to the larger
  // remainder (c, magnitude 2) -> 33 and 67.
  const bills: BillInput[] = [
    {
      currency: "EUR",
      participants: [
        { contactId: "me", paidCents: 103, owedCents: 3 },
        { contactId: "b", paidCents: 0, owedCents: 1 },
        { contactId: "c", paidCents: 0, owedCents: 2 },
      ],
    },
  ];
  const pw = computePairwiseBalances("me", bills, []);
  const b = pw.get("b")?.get("EUR") ?? 0;
  const c = pw.get("c")?.get("EUR") ?? 0;
  assert.equal(b + c, 100);
  assert.deepEqual([b, c], [33, 67]);
});

test("pairwise: negative net distributed across creditors with remainder", () => {
  // me underpaid by 100; two creditors of equal magnitude split the -100.
  const bills: BillInput[] = [
    {
      currency: "EUR",
      participants: [
        { contactId: "me", paidCents: 0, owedCents: 100 },
        { contactId: "b", paidCents: 50, owedCents: 0 },
        { contactId: "c", paidCents: 50, owedCents: 0 },
      ],
    },
  ];
  const pw = computePairwiseBalances("me", bills, []);
  const b = pw.get("b")?.get("EUR") ?? 0;
  const c = pw.get("c")?.get("EUR") ?? 0;
  assert.deepEqual([b, c], [-50, -50]);
  assert.equal(b + c, -100);
});

test("pairwise: I am not in the bill -> no entries", () => {
  const bills: BillInput[] = [
    {
      currency: "EUR",
      participants: [
        { contactId: "a", paidCents: 100, owedCents: 50 },
        { contactId: "b", paidCents: 0, owedCents: 50 },
      ],
    },
  ];
  const pw = computePairwiseBalances("me", bills, []);
  assert.equal(pw.size, 0);
});

test("pairwise: my net is zero in bill -> skipped", () => {
  const bills: BillInput[] = [
    {
      currency: "EUR",
      participants: [
        { contactId: "me", paidCents: 50, owedCents: 50 },
        { contactId: "b", paidCents: 50, owedCents: 50 },
      ],
    },
  ];
  const pw = computePairwiseBalances("me", bills, []);
  assert.equal(pw.size, 0);
});

test("pairwise: payment not involving me is ignored", () => {
  const payments: PaymentInput[] = [
    { currency: "EUR", fromContactId: "a", toContactId: "b", amountCents: 100 },
  ];
  const pw = computePairwiseBalances("me", [], payments);
  assert.equal(pw.size, 0);
});

test("pairwise: degenerate bill with no opposite side is skipped", () => {
  // me overpaid but the only other participant also overpaid (no debtor side).
  const bills: BillInput[] = [
    {
      currency: "EUR",
      participants: [
        { contactId: "me", paidCents: 100, owedCents: 50 },
        { contactId: "b", paidCents: 100, owedCents: 50 },
      ],
    },
  ];
  const pw = computePairwiseBalances("me", bills, []);
  assert.equal(pw.size, 0);
});

test("pairwise: one currency prunes to zero, another survives", () => {
  // With b: EUR nets to 0 (pruned) but USD stays nonzero (kept).
  const bills: BillInput[] = [
    {
      currency: "EUR",
      participants: [
        { contactId: "me", paidCents: 100, owedCents: 50 },
        { contactId: "b", paidCents: 0, owedCents: 50 },
      ],
    },
    {
      currency: "USD",
      participants: [
        { contactId: "me", paidCents: 0, owedCents: 30 },
        { contactId: "b", paidCents: 60, owedCents: 30 },
      ],
    },
  ];
  // me is owed 50 EUR by b, then b pays me 50 EUR -> EUR cancels.
  const payments: PaymentInput[] = [
    { currency: "EUR", fromContactId: "b", toContactId: "me", amountCents: 50 },
  ];
  const pw = computePairwiseBalances("me", bills, payments);
  const b = pw.get("b");
  assert.ok(b);
  assert.equal(b.has("EUR"), false);
  assert.equal(b.get("USD"), -30); // I owe b 30 USD
});

test("pairwise: payment to me reduces their balance", () => {
  const payments: PaymentInput[] = [
    { currency: "EUR", fromContactId: "b", toContactId: "me", amountCents: 400 },
  ];
  const pw = computePairwiseBalances("me", [], payments);
  assert.equal(pw.get("b")?.get("EUR"), -400);
});
