import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveJwtSecret } from "./jwt-secret.server.ts";

test("an explicitly configured secret is used verbatim (dev and prod)", () => {
  assert.equal(resolveJwtSecret("a-configured-secret-value-1234567890", false), "a-configured-secret-value-1234567890");
  assert.equal(resolveJwtSecret("a-configured-secret-value-1234567890", true), "a-configured-secret-value-1234567890");
});

test("production with no secret fails closed (undefined → boot validation rejects)", () => {
  assert.equal(resolveJwtSecret(undefined, true), undefined);
});

test("dev with no secret mints a strong, RANDOM secret — never a shipped constant", () => {
  const a = resolveJwtSecret(undefined, false);
  const b = resolveJwtSecret(undefined, false);
  assert.ok(a && a.length >= 32, "dev fallback must be at least 32 chars");
  assert.notEqual(a, b, "each boot must produce a different secret (random, not hard-coded)");
});
