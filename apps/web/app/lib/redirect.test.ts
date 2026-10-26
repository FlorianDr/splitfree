import { test } from "node:test";
import assert from "node:assert/strict";
import { loginUrlFor, returnPathFor, safeRedirectPath, withParam } from "./redirect.ts";

test("safeRedirectPath keeps same-site absolute paths", () => {
  assert.equal(safeRedirectPath("/groups/join/abc"), "/groups/join/abc");
  assert.equal(safeRedirectPath("/bills/1?x=2#y"), "/bills/1?x=2#y");
});

test("safeRedirectPath rejects anything that could leave the site", () => {
  for (const bad of [
    "//evil.example",
    "/\\evil.example",
    "https://evil.example",
    "javascript:alert(1)",
    "evil.example",
    "/\t/evil.example",
    "/\n/evil.example",
    "",
    undefined,
    null,
    42,
    "/" + "a".repeat(3000),
  ]) {
    assert.equal(safeRedirectPath(bad), "/", `should reject ${JSON.stringify(bad)}`);
  }
});

test("withParam adds a parameter and keeps the existing query", () => {
  assert.equal(withParam("/groups/join/abc", "passkey", "setup"), "/groups/join/abc?passkey=setup");
  assert.equal(withParam("/?a=1", "passkey", "setup"), "/?a=1&passkey=setup");
});

test("returnPathFor strips React Router single-fetch artefacts", () => {
  assert.equal(returnPathFor("http://h/groups/join/abc"), "/groups/join/abc");
  assert.equal(returnPathFor("http://h/groups/join/abc.data?_routes=routes%2Fx"), "/groups/join/abc");
  assert.equal(returnPathFor("http://h/_root.data"), "/");
  assert.equal(returnPathFor("http://h/bills/new?x=1&_routes=a"), "/bills/new?x=1");
});

test("loginUrlFor carries the encoded return path, but not for the home page or unsafe paths", () => {
  assert.equal(loginUrlFor("/groups/join/abc"), "/login?redirectTo=%2Fgroups%2Fjoin%2Fabc");
  assert.equal(loginUrlFor("/"), "/login");
  assert.equal(loginUrlFor("//evil.example"), "/login");
});
