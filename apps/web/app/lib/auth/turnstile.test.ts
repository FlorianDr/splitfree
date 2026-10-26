import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isTurnstileTestKey,
  resolveTurnstileKeys,
  SITEVERIFY_URL,
  verifyTurnstileToken,
} from "./turnstile.server.ts";

const LIVE_SECRET = "0x4AAAAAAAexampleLiveSecretKey";

/** A fake fetch that answers each call from `replies` in order and records what it was sent. */
function fakeFetch(replies: Array<(() => Response) | Error>) {
  const calls: URLSearchParams[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(url), SITEVERIFY_URL);
    calls.push(new URLSearchParams(init?.body as URLSearchParams));
    const next = replies[calls.length - 1];
    if (!next) throw new Error("unexpected extra siteverify call");
    if (next instanceof Error) throw next;
    return next();
  }) as typeof fetch;
  return { impl, calls };
}

const json = (body: unknown, status = 200) => () =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const base = { secret: LIVE_SECRET, token: "tok", remoteip: "203.0.113.7" };

test("success with matching hostname and action", async () => {
  const f = fakeFetch([json({ success: true, hostname: "splitfree.cash", action: "login-request" })]);
  const r = await verifyTurnstileToken({
    ...base,
    expectedHostname: "splitfree.cash",
    expectedAction: "login-request",
    fetchImpl: f.impl,
  });
  assert.deepEqual(r, { ok: true });
  assert.equal(f.calls[0]?.get("secret"), LIVE_SECRET);
  assert.equal(f.calls[0]?.get("response"), "tok");
  assert.equal(f.calls[0]?.get("remoteip"), "203.0.113.7");
  assert.ok(f.calls[0]?.get("idempotency_key"));
});

test("Cloudflare rejection is reported with its error codes", async () => {
  const f = fakeFetch([json({ success: false, "error-codes": ["timeout-or-duplicate"] })]);
  assert.deepEqual(await verifyTurnstileToken({ ...base, fetchImpl: f.impl }), {
    ok: false,
    reason: "rejected",
    codes: ["timeout-or-duplicate"],
  });
});

test("hostname or action mismatch fails with a live secret", async () => {
  const wrongHost = fakeFetch([json({ success: true, hostname: "evil.example", action: "login-request" })]);
  assert.equal(
    (await verifyTurnstileToken({ ...base, expectedHostname: "splitfree.cash", fetchImpl: wrongHost.impl })).ok,
    false,
  );
  const wrongAction = fakeFetch([json({ success: true, hostname: "splitfree.cash", action: "other" })]);
  const r = await verifyTurnstileToken({ ...base, expectedAction: "login-request", fetchImpl: wrongAction.impl });
  assert.deepEqual(r, { ok: false, reason: "action" });
});

test("test-key responses (action 'test') pass when the caller skips the checks", async () => {
  const f = fakeFetch([json({ success: true, hostname: "localhost", action: "test" })]);
  const r = await verifyTurnstileToken({
    secret: "1x0000000000000000000000000000000AA",
    token: "XXXX.DUMMY.TOKEN.XXXX",
    remoteip: null,
    fetchImpl: f.impl,
  });
  assert.deepEqual(r, { ok: true });
  assert.equal(f.calls[0]?.has("remoteip"), false, "no remoteip sent when unknown");
});

test("5xx, network errors and internal-error are retried once with the same idempotency key", async () => {
  for (const first of [json({}, 502), new Error("ECONNRESET"), json({ success: false, "error-codes": ["internal-error"] })]) {
    const f = fakeFetch([first, json({ success: true })]);
    assert.deepEqual(await verifyTurnstileToken({ ...base, fetchImpl: f.impl }), { ok: true });
    assert.equal(f.calls.length, 2);
    assert.equal(f.calls[0]?.get("idempotency_key"), f.calls[1]?.get("idempotency_key"));
  }
});

test("fails closed when Cloudflare stays unavailable", async () => {
  const f = fakeFetch([new Error("timeout"), new Error("timeout")]);
  assert.deepEqual(await verifyTurnstileToken({ ...base, fetchImpl: f.impl }), { ok: false, reason: "unavailable" });
  const bad = fakeFetch([() => new Response("not json", { status: 200 })]);
  assert.deepEqual(await verifyTurnstileToken({ ...base, fetchImpl: bad.impl }), { ok: false, reason: "unavailable" });
});

test("empty or oversized tokens are rejected without calling Cloudflare", async () => {
  const f = fakeFetch([]);
  assert.deepEqual(await verifyTurnstileToken({ ...base, token: "", fetchImpl: f.impl }), { ok: false, reason: "missing" });
  assert.deepEqual(
    await verifyTurnstileToken({ ...base, token: "x".repeat(2049), fetchImpl: f.impl }),
    { ok: false, reason: "missing" },
  );
  assert.equal(f.calls.length, 0);
});

test("isTurnstileTestKey matches Cloudflare's dummy keys only", () => {
  for (const k of [
    "1x00000000000000000000AA",
    "2x00000000000000000000AB",
    "3x00000000000000000000FF",
    "1x0000000000000000000000000000000AA",
    "2x0000000000000000000000000000000AA",
  ]) {
    assert.ok(isTurnstileTestKey(k), k);
  }
  assert.ok(!isTurnstileTestKey("0x4AAAAAAABkMYinukE8nzY"));
  assert.ok(!isTurnstileTestKey(LIVE_SECRET));
});

test("no keys configured turns the bot check off, in dev and production alike", () => {
  for (const production of [false, true]) {
    assert.equal(resolveTurnstileKeys(undefined, undefined, production), null);
    assert.equal(resolveTurnstileKeys("", "", production), null);
  }
});

test("only one Turnstile key is a config error", () => {
  assert.throws(() => resolveTurnstileKeys("0x4AAAAAAABkMYinukE8nzY", undefined, true), /both/);
  assert.throws(() => resolveTurnstileKeys(undefined, LIVE_SECRET, false), /both/);
});

test("test keys work outside production and are refused in production", () => {
  const site = "1x00000000000000000000AA";
  const secret = "1x0000000000000000000000000000000AA";
  assert.deepEqual(resolveTurnstileKeys(site, secret, false), { siteKey: site, secretKey: secret });
  assert.throws(() => resolveTurnstileKeys(site, secret, true), /test keys/);
  assert.deepEqual(resolveTurnstileKeys("0x4AAAAAAABkMYinukE8nzY", LIVE_SECRET, true), {
    siteKey: "0x4AAAAAAABkMYinukE8nzY",
    secretKey: LIVE_SECRET,
  });
});
