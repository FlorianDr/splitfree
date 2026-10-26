import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addCents,
  allocateOwed,
  computeNetBalances,
  computePairwiseBalances,
  formatCents,
  isZero,
  negate,
  simplifyDebts,
  sum,
} from "./index.ts";

test("index re-exports the public API", () => {
  assert.equal(typeof addCents, "function");
  assert.equal(typeof negate, "function");
  assert.equal(typeof isZero, "function");
  assert.equal(typeof sum, "function");
  assert.equal(typeof formatCents, "function");
  assert.equal(typeof allocateOwed, "function");
  assert.equal(typeof computeNetBalances, "function");
  assert.equal(typeof computePairwiseBalances, "function");
  assert.equal(typeof simplifyDebts, "function");
});

test("index: a tiny end-to-end flow", () => {
  const owed = allocateOwed({
    totalCents: 900,
    participantIds: ["a", "b", "c"],
    mode: "equal",
  });
  const net = computeNetBalances(
    [
      {
        currency: "EUR",
        participants: [
          { contactId: "a", paidCents: 900, owedCents: owed["a"] ?? 0 },
          { contactId: "b", paidCents: 0, owedCents: owed["b"] ?? 0 },
          { contactId: "c", paidCents: 0, owedCents: owed["c"] ?? 0 },
        ],
      },
    ],
    [],
  );
  const transfers = simplifyDebts(net);
  assert.equal(transfers.length, 2);
});
