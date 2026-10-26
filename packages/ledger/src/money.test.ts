import { test } from "node:test";
import assert from "node:assert/strict";
import { addCents, formatCents, isZero, negate, sum } from "./money.ts";

test("addCents adds integer cents", () => {
  assert.equal(addCents(100, 250), 350);
  assert.equal(addCents(-100, 100), 0);
});

test("negate flips sign", () => {
  assert.equal(negate(100), -100);
  assert.equal(negate(-50), 50);
  assert.equal(negate(0), 0);
});

test("isZero", () => {
  assert.equal(isZero(0), true);
  assert.equal(isZero(1), false);
  assert.equal(isZero(-1), false);
});

test("sum of list, empty is 0", () => {
  assert.equal(sum([]), 0);
  assert.equal(sum([1, 2, 3]), 6);
  assert.equal(sum([100, -100, 50]), 50);
});

test("formatCents EUR (2 decimals)", () => {
  // 123456 minor units -> 1234.56 EUR
  const out = formatCents(123456, "EUR", "en-US");
  assert.match(out, /1,234\.56/);
  assert.match(out, /€/);
});

test("formatCents USD (2 decimals)", () => {
  const out = formatCents(500, "USD", "en-US");
  assert.equal(out, "$5.00");
});

test("formatCents JPY (0 decimals)", () => {
  // 5000 minor units of JPY are 5000 yen (exponent 0).
  const out = formatCents(5000, "JPY", "en-US");
  assert.match(out, /5,000/);
  assert.match(out, /¥|JP¥/);
  assert.doesNotMatch(out, /\.\d/);
});

test("formatCents respects locale grouping", () => {
  const out = formatCents(123456, "USD", "en-US");
  assert.equal(out, "$1,234.56");
});

test("formatCents handles negative", () => {
  const out = formatCents(-500, "USD", "en-US");
  assert.match(out, /5\.00/);
  assert.match(out, /-|\(/);
});
