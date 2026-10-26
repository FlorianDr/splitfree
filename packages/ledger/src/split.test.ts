import { test } from "node:test";
import assert from "node:assert/strict";
import { allocateOwed } from "./split.ts";
import type { SplitInput } from "./split.ts";

function values(rec: Record<string, number>, ids: string[]): number[] {
  return ids.map((id) => rec[id] ?? 0);
}

function totalOf(rec: Record<string, number>): number {
  return Object.values(rec).reduce((a, b) => a + b, 0);
}

test("equal: 2-way of 1 cent -> [1,0]", () => {
  const out = allocateOwed({
    totalCents: 1,
    participantIds: ["a", "b"],
    mode: "equal",
  });
  assert.deepEqual(values(out, ["a", "b"]), [1, 0]);
  assert.equal(totalOf(out), 1);
});

test("equal: 3-way of 1000 -> [334,333,333]", () => {
  const ids = ["a", "b", "c"];
  const out = allocateOwed({ totalCents: 1000, participantIds: ids, mode: "equal" });
  assert.deepEqual(values(out, ids), [334, 333, 333]);
  assert.equal(totalOf(out), 1000);
});

test("equal: 7-way of 100 -> [15,15,14,14,14,14,14]", () => {
  const ids = ["a", "b", "c", "d", "e", "f", "g"];
  const out = allocateOwed({ totalCents: 100, participantIds: ids, mode: "equal" });
  assert.deepEqual(values(out, ids), [15, 15, 14, 14, 14, 14, 14]);
  assert.equal(totalOf(out), 100);
});

test("equal: 3-way of 1 -> [1,0,0]", () => {
  const ids = ["a", "b", "c"];
  const out = allocateOwed({ totalCents: 1, participantIds: ids, mode: "equal" });
  assert.deepEqual(values(out, ids), [1, 0, 0]);
  assert.equal(totalOf(out), 1);
});

test("exact: valid passes through", () => {
  const ids = ["a", "b", "c"];
  const out = allocateOwed({
    totalCents: 1000,
    participantIds: ids,
    mode: "exact",
    exactCents: { a: 500, b: 300, c: 200 },
  });
  assert.deepEqual(out, { a: 500, b: 300, c: 200 });
});

test("exact: sum mismatch throws", () => {
  assert.throws(
    () =>
      allocateOwed({
        totalCents: 1000,
        participantIds: ["a", "b"],
        mode: "exact",
        exactCents: { a: 500, b: 400 },
      }),
    /sum/,
  );
});

test("exact: missing participant throws", () => {
  assert.throws(
    () =>
      allocateOwed({
        totalCents: 1000,
        participantIds: ["a", "b"],
        mode: "exact",
        exactCents: { a: 1000, c: 0 },
      }),
    /missing|cover/,
  );
});

test("exact: wrong cardinality throws", () => {
  assert.throws(
    () =>
      allocateOwed({
        totalCents: 1000,
        participantIds: ["a", "b"],
        mode: "exact",
        exactCents: { a: 1000 },
      }),
    /cover/,
  );
});

test("exact: missing exactCents throws", () => {
  assert.throws(
    () =>
      allocateOwed({
        totalCents: 1000,
        participantIds: ["a"],
        mode: "exact",
      }),
    /requires exactCents/,
  );
});

test("exact: non-integer cents throws", () => {
  assert.throws(
    () =>
      allocateOwed({
        totalCents: 1000,
        participantIds: ["a", "b"],
        mode: "exact",
        exactCents: { a: 500.5, b: 499.5 },
      }),
    /integer/,
  );
});

test("percent: 33.33/33.33/33.34 of 10000 -> [3333,3333,3334]", () => {
  const ids = ["a", "b", "c"];
  const out = allocateOwed({
    totalCents: 10000,
    participantIds: ids,
    mode: "percent",
    percent: { a: 33.33, b: 33.33, c: 33.34 },
  });
  assert.deepEqual(values(out, ids), [3333, 3333, 3334]);
  assert.equal(totalOf(out), 10000);
});

test("percent: not summing to 100 throws", () => {
  assert.throws(
    () =>
      allocateOwed({
        totalCents: 10000,
        participantIds: ["a", "b"],
        mode: "percent",
        percent: { a: 50, b: 49 },
      }),
    /sum to 100/,
  );
});

test("percent: missing percent map throws", () => {
  assert.throws(
    () =>
      allocateOwed({
        totalCents: 100,
        participantIds: ["a"],
        mode: "percent",
      }),
    /requires percent/,
  );
});

test("percent: missing participant throws", () => {
  assert.throws(
    () =>
      allocateOwed({
        totalCents: 100,
        participantIds: ["a", "b"],
        mode: "percent",
        percent: { a: 100 },
      }),
    /missing participant/,
  );
});

test("percent: negative percent throws", () => {
  assert.throws(
    () =>
      allocateOwed({
        totalCents: 100,
        participantIds: ["a", "b"],
        mode: "percent",
        percent: { a: 110, b: -10 },
      }),
    />= 0/,
  );
});

test("percent: leftover distribution by remainder", () => {
  // 33.34/33.33/33.33 -> a gets the larger ideal so should round up first.
  const ids = ["a", "b", "c"];
  const out = allocateOwed({
    totalCents: 10000,
    participantIds: ids,
    mode: "percent",
    percent: { a: 33.34, b: 33.33, c: 33.33 },
  });
  assert.equal(totalOf(out), 10000);
  assert.deepEqual(values(out, ids), [3334, 3333, 3333]);
});

test("shares: [1,1,2] of 10000 -> {a:2500,b:2500,c:5000}", () => {
  const ids = ["a", "b", "c"];
  const out = allocateOwed({
    totalCents: 10000,
    participantIds: ids,
    mode: "shares",
    weights: { a: 1, b: 1, c: 2 },
  });
  assert.deepEqual(out, { a: 2500, b: 2500, c: 5000 });
  assert.equal(totalOf(out), 10000);
});

test("shares: [1,1,1] of 10001 -> [3334,3334,3333] deterministic by order", () => {
  const ids = ["a", "b", "c"];
  const out = allocateOwed({
    totalCents: 10001,
    participantIds: ids,
    mode: "shares",
    weights: { a: 1, b: 1, c: 1 },
  });
  assert.deepEqual(values(out, ids), [3334, 3334, 3333]);
  assert.equal(totalOf(out), 10001);
});

test("shares: zero share throws", () => {
  assert.throws(
    () =>
      allocateOwed({
        totalCents: 100,
        participantIds: ["a", "b"],
        mode: "shares",
        weights: { a: 1, b: 0 },
      }),
    /> 0/,
  );
});

test("shares: missing share throws", () => {
  assert.throws(
    () =>
      allocateOwed({
        totalCents: 100,
        participantIds: ["a", "b"],
        mode: "shares",
        weights: { a: 1 },
      }),
    /> 0/,
  );
});

test("shares: missing weights map throws", () => {
  assert.throws(
    () =>
      allocateOwed({
        totalCents: 100,
        participantIds: ["a"],
        mode: "shares",
      }),
    /requires weights/,
  );
});

test("empty participants throws", () => {
  assert.throws(
    () => allocateOwed({ totalCents: 100, participantIds: [], mode: "equal" }),
    /must not be empty/,
  );
});

test("duplicate participant throws", () => {
  assert.throws(
    () =>
      allocateOwed({
        totalCents: 100,
        participantIds: ["a", "a"],
        mode: "equal",
      }),
    /duplicate/,
  );
});

test("non-integer total throws", () => {
  assert.throws(
    () =>
      allocateOwed({
        totalCents: 100.5,
        participantIds: ["a"],
        mode: "equal",
      }),
    /integer/,
  );
});

test("negative total: equal still sums exactly (claw-back path)", () => {
  // Negative totals exercise the leftover < 0 branch.
  const ids = ["a", "b", "c"];
  const out = allocateOwed({
    totalCents: -1000,
    participantIds: ids,
    mode: "equal",
  });
  assert.equal(totalOf(out), -1000);
  // -1000/3 = -333.33 -> floor each = -334 (sum -1002), claw back 2.
  assert.deepEqual(values(out, ids), [-333, -333, -334]);
});

test("shares with fractional weights still exact", () => {
  const ids = ["a", "b", "c"];
  const input: SplitInput = {
    totalCents: 100,
    participantIds: ids,
    mode: "shares",
    weights: { a: 0.5, b: 0.25, c: 0.25 },
  };
  const out = allocateOwed(input);
  assert.equal(totalOf(out), 100);
  assert.deepEqual(values(out, ids), [50, 25, 25]);
});
