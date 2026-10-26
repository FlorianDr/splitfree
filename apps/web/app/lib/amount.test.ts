import { test } from "node:test";
import assert from "node:assert/strict";
import { numberSeparators, parseCents, parseDecimal } from "./amount.ts";

const en = numberSeparators("en-US");
const de = numberSeparators("de-DE");
const pl = numberSeparators("pl-PL");
const cs = numberSeparators("cs-CZ");

test("numberSeparators reads the locale's decimal point", () => {
  assert.equal(en.decimal, ".");
  assert.equal(de.decimal, ",");
  assert.equal(pl.decimal, ",");
  assert.equal(cs.decimal, ",");
  assert.equal(de.group, ".");
  assert.equal(en.group, ",");
});

test("numberSeparators falls back to en for missing or invalid tags", () => {
  assert.deepEqual(numberSeparators("not a locale!"), { decimal: ".", group: "," });
  assert.deepEqual(numberSeparators(undefined), { decimal: ".", group: "," });
  assert.deepEqual(numberSeparators(""), { decimal: ".", group: "," });
});

test("parseCents accepts both decimal separators in every locale", () => {
  for (const seps of [en, de, pl, cs]) {
    assert.equal(parseCents("80,62", seps), 8062);
    assert.equal(parseCents("80.62", seps), 8062);
    assert.equal(parseCents("80,6", seps), 8060);
    assert.equal(parseCents("80", seps), 8000);
    assert.equal(parseCents("80,", seps), 8000);
    assert.equal(parseCents(",5", seps), 50);
    assert.equal(parseCents("0.10", seps), 10);
    assert.equal(parseCents(" 12,30 ", seps), 1230);
  }
});

test("parseCents is exact where float multiplication isn't", () => {
  assert.equal(parseCents("1.15"), 115); // 1.15 * 100 = 114.99999999999999
  assert.equal(parseCents("80.62"), 8062);
  assert.equal(parseCents("4.35"), 435);
});

test("parseCents reads thousands separators in both styles", () => {
  for (const seps of [en, de, pl, cs]) {
    assert.equal(parseCents("1.234,56", seps), 123456);
    assert.equal(parseCents("1,234.56", seps), 123456);
    assert.equal(parseCents("1.234.567", seps), 123456700);
    assert.equal(parseCents("1,234,567", seps), 123456700);
    assert.equal(parseCents("1 234,56", seps), 123456);
    assert.equal(parseCents("1 234,56", seps), 123456);
    assert.equal(parseCents("1'234.50", seps), 123450);
  }
});

test("a lone separator before three digits follows the locale", () => {
  assert.equal(parseCents("1,234", en), 123400); // en groups with ","
  assert.equal(parseCents("1.234", de), 123400); // de groups with "."
  assert.equal(parseCents("1.000", en), 100); // en decimal point, trailing zeros
  assert.equal(parseCents("1,000", de), 100);
  // pl/cs group with a space, so "1.000" could be 1 or 1000: refuse rather than guess.
  assert.equal(parseCents("1.000", pl), null);
  assert.equal(parseCents("1.000", cs), null);
  assert.equal(parseCents("1,000", pl), 100);
});

test("parseCents refuses what it can't read", () => {
  for (const bad of ["abc", "1,2,3.4.5", "1.2,3", "12.34.56,7", ".", ",", "1..2", "-5", "5€", "1e3", "12,345,67"]) {
    assert.equal(parseCents(bad, de), null, `should refuse ${JSON.stringify(bad)}`);
  }
  assert.equal(parseCents("1,234", de), null); // three decimals: not a money amount
  assert.equal(parseCents("9".repeat(20)), null);
});

test("blank reads as zero", () => {
  assert.equal(parseCents(""), 0);
  assert.equal(parseCents("   "), 0);
  assert.equal(parseDecimal(""), 0);
});

test("parseDecimal keeps more than two decimals (percent, shares)", () => {
  assert.equal(parseDecimal("33,333", de), 33.333);
  assert.equal(parseDecimal("6,666", pl), 6.666);
  assert.equal(parseDecimal("6.66", pl), 6.66);
  assert.equal(parseDecimal("12,5", en), 12.5);
  assert.equal(parseDecimal("2", en), 2);
  assert.equal(parseDecimal("x", en), null);
});
