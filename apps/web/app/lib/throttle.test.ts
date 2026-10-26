import { test } from "node:test";
import assert from "node:assert/strict";
import { createThrottle } from "./throttle.server.ts";

test("allows the first event per key per window and counts the suppressed ones", () => {
  const allow = createThrottle(1000);
  assert.deepEqual(allow("a", 0), { allow: true, suppressed: 0 });
  assert.deepEqual(allow("a", 10), { allow: false });
  assert.deepEqual(allow("a", 999), { allow: false });
  assert.deepEqual(allow("b", 10), { allow: true, suppressed: 0 }, "keys are independent");
  assert.deepEqual(allow("a", 1000), { allow: true, suppressed: 2 });
});

test("stays bounded: evicts expired keys first, then the oldest", () => {
  const allow = createThrottle(1000, 2);
  allow("a", 0);
  allow("b", 500);
  allow("c", 1200); // "a" expired → evicted, "b" kept
  assert.deepEqual(allow("b", 1300), { allow: false }, "b was not evicted");
  allow("d", 1300); // nothing expired → oldest ("b") evicted
  assert.deepEqual(allow("b", 1310), { allow: true, suppressed: 0 });
});
