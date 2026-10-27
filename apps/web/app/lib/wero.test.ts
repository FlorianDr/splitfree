import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWeroLink } from "./wero.ts";

test("parseWeroLink keeps a clean link on either Wero host", () => {
  assert.deepEqual(parseWeroLink("https://share.wero-wallet.eu/p/1/c/Vzo5iyvd7z"), {
    ok: true,
    link: "https://share.wero-wallet.eu/p/1/c/Vzo5iyvd7z",
  });
  assert.deepEqual(parseWeroLink("https://share.weropay.eu/p/1/s/AbC-123_x"), {
    ok: true,
    link: "https://share.weropay.eu/p/1/s/AbC-123_x",
  });
  // Scheme added, amount and trailing slash dropped.
  assert.deepEqual(parseWeroLink(" share.weropay.eu/p/1/s/AbC123/?a=500&c=EUR#x "), {
    ok: true,
    link: "https://share.weropay.eu/p/1/s/AbC123",
  });
});

test("parseWeroLink refuses other hosts, schemes and paths", () => {
  for (const input of [
    "",
    "https://evil.example/p/1/s/AbC123",
    "https://share.weropay.eu.evil.example/p/1/s/AbC123",
    "https://evil.example/?u=share.weropay.eu/p/1/s/AbC123",
    "https://user@share.weropay.eu:8443/p/1/x/AbC123",
    "http://share.weropay.eu/p/1/s/AbC123",
    "https://share.weropay.eu/p/1/s/",
    "https://share.weropay.eu/p/1/x/AbC123",
    "https://share.weropay.eu/p/1/s/Ab%2FC123",
    "javascript:alert(1)",
  ]) {
    assert.equal(parseWeroLink(input).ok, false, input);
  }
});
