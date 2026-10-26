import { test } from "node:test";
import assert from "node:assert/strict";
import { matchSuggestions, mergeMembers } from "./groups.ts";

test("mergeMembers appends new emails in order and skips ones already on the bill (case-insensitive)", () => {
  const r = mergeMembers(["me@x.com", "bob@x.com"], ["Bob@X.com", "carol@x.com", " dave@x.com "], 50);
  assert.deepEqual(r.next, ["me@x.com", "bob@x.com", "carol@x.com", "dave@x.com"]);
  assert.deepEqual(r.added, ["carol@x.com", "dave@x.com"]);
  assert.deepEqual(r.alreadyIn, ["bob@x.com"]);
  assert.equal(r.overflow, false);
});

test("mergeMembers skips your own email because the participant list always starts with it", () => {
  const r = mergeMembers(["me@x.com"], ["me@x.com", "bob@x.com"], 50);
  assert.deepEqual(r.next, ["me@x.com", "bob@x.com"]);
  assert.deepEqual(r.alreadyIn, ["me@x.com"]);
});

test("mergeMembers ignores duplicates inside the group itself", () => {
  const r = mergeMembers(["me@x.com"], ["bob@x.com", "BOB@x.com"], 50);
  assert.deepEqual(r.next, ["me@x.com", "bob@x.com"]);
  assert.deepEqual(r.alreadyIn, []);
});

test("mergeMembers is all or nothing: an overflowing group leaves the list unchanged", () => {
  const current = ["me@x.com", "a@x.com"];
  const r = mergeMembers(current, ["b@x.com", "c@x.com"], 3);
  assert.equal(r.overflow, true);
  assert.equal(r.next, current);
  assert.deepEqual(r.added, []);
  // Exactly at the cap is fine.
  assert.equal(mergeMembers(current, ["b@x.com"], 3).overflow, false);
});

test("mergeMembers with everyone already in adds nothing", () => {
  const r = mergeMembers(["me@x.com", "bob@x.com"], ["bob@x.com"], 50);
  assert.deepEqual(r.added, []);
  assert.deepEqual(r.next, ["me@x.com", "bob@x.com"]);
});

const contacts = [
  { email: "flo@x.com", name: "Flo" },
  { email: "anna@x.com", name: "Anna Flat" },
];
const groups = [
  { id: "g1", name: "Flatmates", members: ["me@x.com", "bob@x.com"] },
  { id: "g2", name: "Running club", members: ["me@x.com", "carol@x.com"] },
];

test("matchSuggestions lists matching groups first, then contacts, case-insensitively", () => {
  const s = matchSuggestions("FLAT", contacts, groups, ["me@x.com"]);
  assert.deepEqual(
    s.map((x) => (x.kind === "group" ? `group:${x.id}` : `contact:${x.email}`)),
    ["group:g1", "contact:anna@x.com"],
  );
});

test("matchSuggestions hides a group once all its members are on the bill", () => {
  const s = matchSuggestions("flat", contacts, groups, ["me@x.com", "bob@x.com"]);
  assert.ok(!s.some((x) => x.kind === "group"));
});

test("matchSuggestions returns only contacts when no groups are passed, and nothing for an empty query", () => {
  assert.ok(matchSuggestions("fl", contacts, [], []).every((x) => x.kind === "contact"));
  assert.deepEqual(matchSuggestions("   ", contacts, groups, []), []);
});

test("matchSuggestions caps groups at 3 and the total at 6", () => {
  const many = Array.from({ length: 5 }, (_, i) => ({ id: `g${i}`, name: `Team ${i}`, members: [`m${i}@x.com`] }));
  const people = Array.from({ length: 8 }, (_, i) => ({ email: `team${i}@x.com`, name: `Team mate ${i}` }));
  const s = matchSuggestions("team", people, many, []);
  assert.equal(s.filter((x) => x.kind === "group").length, 3);
  assert.equal(s.length, 6);
});
