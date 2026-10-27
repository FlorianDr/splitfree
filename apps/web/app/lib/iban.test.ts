import { test } from "node:test";
import assert from "node:assert/strict";
import { formatIban, normalizeIban, validateAccountHolder, validateIban } from "./iban.ts";

test("validateIban accepts valid SEPA IBANs", () => {
  for (const iban of [
    "DE89370400440532013000",
    "GB82WEST12345698765432",
    "NL91ABNA0417164300",
    "FR1420041010050500013M02606",
    "BE68539007547034",
    "NO9386011117947",
    "MT84MALT011000012345MTLCAST001S",
    "CH9300762011623852957",
    "AT611904300234573201",
  ]) {
    assert.deepEqual(validateIban(iban), { ok: true, iban });
  }
});

test("validateIban normalizes spaces, case and an IBAN label", () => {
  assert.deepEqual(validateIban("  de89 3704 0044 0532 0130 00 "), { ok: true, iban: "DE89370400440532013000" });
  assert.deepEqual(validateIban("IBAN: DE89 3704 0044 0532 0130 00"), { ok: true, iban: "DE89370400440532013000" });
  assert.deepEqual(validateIban("DE89 3704 0044 0532 0130 00"), {
    ok: true,
    iban: "DE89370400440532013000",
  });
});

test("validateIban rejects a typo via the check digits", () => {
  const typo = validateIban("DE89370400440532013001"); // last digit changed
  assert.equal(typo.ok, false);
  const swapped = validateIban("DE89370400440532010300"); // two digits swapped
  assert.equal(swapped.ok, false);
  assert.match(!typo.ok ? typo.error : "", /check digits/);
});

test("validateIban checks the country's length", () => {
  const short = validateIban("DE8937040044053201300");
  assert.deepEqual(short, { ok: false, error: "A DE IBAN has 22 characters, this one has 21." });
});

test("validateIban rejects non-SEPA countries and malformed input", () => {
  // Valid Saudi IBAN, but not a SEPA country.
  assert.match(String((validateIban("SA0380000000608010167519") as { error: string }).error), /SEPA/);
  assert.equal(validateIban("").ok, false);
  assert.equal(validateIban("DE89-3704-0044").ok, false);
  assert.equal(validateIban("1234567890").ok, false);
});

test("normalizeIban and formatIban", () => {
  assert.equal(normalizeIban(" iban de89 3704 "), "DE893704");
  assert.equal(formatIban("DE89370400440532013000"), "DE89 3704 0044 0532 0130 00");
  assert.equal(formatIban("NL91ABNA0417164300"), "NL91 ABNA 0417 1643 00");
});

test("validateAccountHolder trims, collapses spaces and limits the length", () => {
  assert.deepEqual(validateAccountHolder("  Jörg   Müller "), { ok: true, name: "Jörg Müller" });
  assert.equal(validateAccountHolder("   ").ok, false);
  assert.equal(validateAccountHolder("x".repeat(70)).ok, true);
  assert.equal(validateAccountHolder("x".repeat(71)).ok, false);
  assert.equal(validateAccountHolder("Bad\u0000Name").ok, false);
});
