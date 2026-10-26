import { test } from "node:test";
import assert from "node:assert/strict";
import { clientIpFrom, ipBuckets, parseIp } from "./client-ip.server.ts";

test("parseIp accepts exactly one valid address and normalizes it", () => {
  assert.equal(parseIp(" 203.0.113.7 "), "203.0.113.7");
  assert.equal(parseIp("2001:DB8::1"), "2001:db8::1");
  assert.equal(parseIp("fe80::1%eth0"), "fe80::1");
  assert.equal(parseIp("::ffff:1.2.3.4"), "1.2.3.4");
  assert.equal(parseIp("::ffff:102:304"), "1.2.3.4");
  assert.equal(parseIp("0:0:0:0:0:ffff:1.2.3.4"), "1.2.3.4");
  for (const bad of [null, undefined, "", "1.2.3.4, 5.6.7.8", "not-an-ip", "1.2.3.256"]) {
    assert.equal(parseIp(bad), null, String(bad));
  }
});

test("clientIpFrom reads only the configured header", () => {
  const headers = new Headers({
    "x-real-ip": "198.51.100.9",
    "x-forwarded-for": "6.6.6.6, 198.51.100.9",
    "cf-connecting-ip": "6.6.6.6",
  });
  assert.equal(clientIpFrom(headers, "x-real-ip"), "198.51.100.9");
  assert.equal(clientIpFrom(headers, undefined), null, "no configured header → trust nothing");
  assert.equal(clientIpFrom(new Headers(), "x-real-ip"), null);
});

test("ipBuckets: IPv4 address + /24", () => {
  assert.deepEqual(ipBuckets("203.0.113.7"), { narrow: "203.0.113.7", wide: "203.0.113.0/24" });
  assert.deepEqual(ipBuckets("::ffff:203.0.113.7"), { narrow: "203.0.113.7", wide: "203.0.113.0/24" });
});

test("ipBuckets: IPv6 /64 + /48, independent of notation", () => {
  const expected = { narrow: "2001:db8:0:1::/64", wide: "2001:db8:0::/48" };
  assert.deepEqual(ipBuckets("2001:db8:0:1::5"), expected);
  assert.deepEqual(ipBuckets("2001:0DB8:0000:0001:aaaa:bbbb:cccc:dddd"), expected);
  assert.deepEqual(ipBuckets("2001:db8::1:0:0:0:9"), expected);
  assert.deepEqual(ipBuckets("2001:db8:0:1::1.2.3.4"), expected);
  assert.deepEqual(ipBuckets("::1"), { narrow: "0:0:0:0::/64", wide: "0:0:0::/48" });
  assert.deepEqual(ipBuckets("::"), { narrow: "0:0:0:0::/64", wide: "0:0:0::/48" });
});

test("ipBuckets: same /64 matches, a different /64 does not", () => {
  assert.equal(ipBuckets("2001:db8:0:1::a")?.narrow, ipBuckets("2001:db8:0:1:ffff::b")?.narrow);
  assert.notEqual(ipBuckets("2001:db8:0:1::a")?.narrow, ipBuckets("2001:db8:0:2::a")?.narrow);
  assert.equal(ipBuckets("2001:db8:0:1::a")?.wide, ipBuckets("2001:db8:0:2::a")?.wide);
});

test("ipBuckets: unknown or invalid IP → null (per-IP limits are skipped, not shared)", () => {
  assert.equal(ipBuckets(null), null);
  assert.equal(ipBuckets("garbage"), null);
});
