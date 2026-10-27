import { test } from "node:test";
import assert from "node:assert/strict";
import { simplifyDebts } from "./simplify.ts";
import type { Cents, Currency, Transfer } from "./types.ts";

function netFrom(
  perCurrency: Record<Currency, Record<string, Cents>>,
): Map<Currency, Map<string, Cents>> {
  const out = new Map<Currency, Map<string, Cents>>();
  for (const [cur, balances] of Object.entries(perCurrency)) {
    out.set(cur, new Map(Object.entries(balances)));
  }
  return out;
}

/** Apply transfers to starting balances and return the resulting net map. */
function applyTransfers(
  net: Map<Currency, Map<string, Cents>>,
  transfers: Transfer[],
): Map<Currency, Map<string, Cents>> {
  const result = new Map<Currency, Map<string, Cents>>();
  for (const [cur, m] of net) {
    result.set(cur, new Map(m));
  }
  for (const t of transfers) {
    const m = result.get(t.currency);
    assert.ok(m, `transfer in unknown currency ${t.currency}`);
    // debtor (from) pays => their net rises toward 0; creditor (to) falls toward 0.
    m.set(t.fromContactId, (m.get(t.fromContactId) ?? 0) + t.amountCents);
    m.set(t.toContactId, (m.get(t.toContactId) ?? 0) - t.amountCents);
  }
  return result;
}

function assertAllZero(net: Map<Currency, Map<string, Cents>>): void {
  for (const m of net.values()) {
    for (const v of m.values()) {
      assert.equal(v, 0);
    }
  }
}

test("simplify: {A:+100,B:-40,C:-60} -> 2 transfers zeroing everyone", () => {
  const net = netFrom({ EUR: { A: 100, B: -40, C: -60 } });
  const transfers = simplifyDebts(net);
  assert.equal(transfers.length, 2);
  assertAllZero(applyTransfers(net, transfers));
  for (const t of transfers) {
    assert.equal(t.toContactId, "A");
    assert.equal(t.currency, "EUR");
    assert.ok(t.amountCents > 0);
  }
});

test("simplify: all-zero -> []", () => {
  const net = netFrom({ EUR: { A: 0, B: 0, C: 0 } });
  assert.deepEqual(simplifyDebts(net), []);
});

test("simplify: empty map -> []", () => {
  assert.deepEqual(simplifyDebts(new Map()), []);
});

test("simplify: chain {A:-10,B:0,C:+10} -> single A->C 10", () => {
  const net = netFrom({ EUR: { A: -10, B: 0, C: 10 } });
  const transfers = simplifyDebts(net);
  assert.equal(transfers.length, 1);
  assert.deepEqual(transfers[0], {
    fromContactId: "A",
    toContactId: "C",
    currency: "EUR",
    amountCents: 10,
  });
});

test("simplify: multi-currency grouped, none crossing", () => {
  const net = netFrom({
    EUR: { A: 50, B: -50 },
    USD: { A: -30, C: 30 },
  });
  const transfers = simplifyDebts(net);
  assertAllZero(applyTransfers(net, transfers));
  for (const t of transfers) {
    assert.ok(t.currency === "EUR" || t.currency === "USD");
  }
  const eur = transfers.filter((t) => t.currency === "EUR");
  const usd = transfers.filter((t) => t.currency === "USD");
  assert.equal(eur.length, 1);
  assert.equal(usd.length, 1);
  assert.deepEqual(eur[0], {
    fromContactId: "B",
    toContactId: "A",
    currency: "EUR",
    amountCents: 50,
  });
  assert.deepEqual(usd[0], {
    fromContactId: "A",
    toContactId: "C",
    currency: "USD",
    amountCents: 30,
  });
});

test("simplify: randomized cases settle to 0 with length <= nonzero-1", () => {
  // Deterministic LCG so the test is reproducible.
  let seed = 0x9e3779b9;
  const rand = (n: number): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed % n;
  };

  for (let iter = 0; iter < 200; iter++) {
    const count = 2 + rand(8);
    const balances: Record<string, Cents> = {};
    let running = 0;
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      ids.push(`p${i}`);
    }
    // Assign random values to all but the last, last absorbs the negative sum.
    for (let i = 0; i < count - 1; i++) {
      const v = rand(2001) - 1000; // -1000..1000
      balances[`p${i}`] = v;
      running += v;
    }
    balances[`p${count - 1}`] = -running;

    const net = netFrom({ EUR: balances });
    const transfers = simplifyDebts(net);

    // Everyone settles to exactly zero.
    assertAllZero(applyTransfers(net, transfers));

    const nonZero = Object.values(balances).filter((v) => v !== 0).length;
    const bound = nonZero === 0 ? 0 : nonZero - 1;
    assert.ok(
      transfers.length <= bound,
      `transfers ${transfers.length} > bound ${bound} (nonzero ${nonZero})`,
    );
    // All transfers are positive integer cents.
    for (const t of transfers) {
      assert.ok(Number.isInteger(t.amountCents) && t.amountCents > 0);
    }
  }
});

test("simplify: ties broken deterministically by contactId", () => {
  // Two creditors of equal size and two debtors of equal size: the comparator's
  // lexicographic tie-break must produce a stable, reproducible ordering.
  const net = netFrom({ EUR: { Bob: 50, Amy: 50, Dan: -50, Cas: -50 } });
  const first = simplifyDebts(net);
  const second = simplifyDebts(netFrom({ EUR: { Bob: 50, Amy: 50, Dan: -50, Cas: -50 } }));
  assert.deepEqual(first, second);
  assertAllZero(applyTransfers(net, first));
  // Largest creditor first is Amy (lexicographically before Bob on tie); largest
  // debtor first is Cas (before Dan). So first transfer is Cas -> Amy.
  assert.deepEqual(first[0], {
    fromContactId: "Cas",
    toContactId: "Amy",
    currency: "EUR",
    amountCents: 50,
  });
  assert.equal(first.length, 2);
});

test("simplify: finds the minimum where largest-first matching does not", () => {
  // {B:+5, D:-5} and {A:+8, C:-7, E:-1} each sum to zero, so 3 transfers settle everyone. Matching the
  // largest creditor with the largest debtor (A with C) splits D across two creditors: 4 transfers.
  const net = netFrom({ EUR: { A: 800, B: 500, C: -700, D: -500, E: -100 } });
  const transfers = simplifyDebts(net);
  assertAllZero(applyTransfers(net, transfers));
  assert.equal(transfers.length, 3);
  assert.deepEqual(
    transfers.find((t) => t.fromContactId === "D"),
    { fromContactId: "D", toContactId: "B", currency: "EUR", amountCents: 500 },
  );
});

/** The true minimum for one currency: n − the most disjoint zero-sum groups, by brute force. */
function bruteForceMinimum(values: Cents[]): number {
  const nonZero = values.filter((v) => v !== 0);
  const best = (rest: Cents[]): number => {
    if (rest.length === 0) return 0;
    // The group holding rest[0]: try every subset of the others that makes it sum to zero.
    const [first = 0, ...others] = rest;
    let most = 0;
    for (let mask = 0; mask < 1 << others.length; mask++) {
      let sum = first;
      others.forEach((v, i) => {
        if (mask & (1 << i)) sum += v;
      });
      if (sum !== 0) continue;
      most = Math.max(most, 1 + best(others.filter((_, i) => !(mask & (1 << i)))));
    }
    return most;
  };
  return nonZero.length - best(nonZero);
}

test("simplify: randomized cases use exactly the minimum number of transfers", () => {
  let seed = 0x2545f491;
  const rand = (n: number): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed % n;
  };
  for (let iter = 0; iter < 300; iter++) {
    const count = 2 + rand(9);
    // Small amounts so zero-sum groups are common, the case where greedy alone over-pays.
    const values: Cents[] = [];
    for (let i = 0; i < count - 1; i++) values.push((rand(9) - 4) * 100);
    values.push(0 - values.reduce((a, b) => a + b, 0)); // 0 − x, never −0
    const net = netFrom({ EUR: Object.fromEntries(values.map((v, i) => [`p${i}`, v])) });
    const transfers = simplifyDebts(net);
    assertAllZero(applyTransfers(net, transfers));
    assert.equal(transfers.length, bruteForceMinimum(values), `balances ${values.join(", ")}`);
  }
});

test("simplify: above the exact-search limit it still settles everyone with <= n-1 transfers", () => {
  const balances: Record<string, Cents> = {};
  for (let i = 0; i < 30; i++) balances[`p${String(i).padStart(2, "0")}`] = i % 2 === 0 ? 1000 + i : -(1000 + i - 1);
  const net = netFrom({ EUR: balances });
  const transfers = simplifyDebts(net);
  assertAllZero(applyTransfers(net, transfers));
  assert.ok(transfers.length <= 29);
});

test("simplify: ignores zero balances mixed with nonzero", () => {
  const net = netFrom({ EUR: { A: 100, Z: 0, B: -100 } });
  const transfers = simplifyDebts(net);
  assert.equal(transfers.length, 1);
  assert.deepEqual(transfers[0], {
    fromContactId: "B",
    toContactId: "A",
    currency: "EUR",
    amountCents: 100,
  });
});
