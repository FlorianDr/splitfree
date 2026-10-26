import { test } from "node:test";
import assert from "node:assert/strict";
import {
  exceededInviteLimit,
  exceededOtpLimit,
  INVITES_PER_ACTOR_PER_DAY,
  isGlobalLimit,
  OTP_PER_EMAIL_PER_HOUR,
  OTP_PER_IP_PER_DAY,
  OTP_PER_IP_PER_HOUR,
  OTP_PER_WIDE_PER_DAY,
  type OtpCounts,
  utcDayStart,
} from "./otp-limits.server.ts";

const limits = { globalPerHour: 15, budgetPerDay: 80 };
const zero: OtpCounts = { email: 0, ipHour: 0, ipDay: 0, ipWideDay: 0, globalHour: 0, budgetDay: 0 };

test("under every limit → allowed", () => {
  assert.equal(exceededOtpLimit(zero, limits, true), null);
  assert.equal(
    exceededOtpLimit(
      { email: 4, ipHour: 2, ipDay: 5, ipWideDay: 9, globalHour: 14, budgetDay: 79 },
      limits,
      true,
    ),
    null,
  );
});

test("each limit trips at exactly its max (counts are taken before insert)", () => {
  const cases: [Partial<OtpCounts>, string][] = [
    [{ email: OTP_PER_EMAIL_PER_HOUR }, "email"],
    [{ ipHour: OTP_PER_IP_PER_HOUR }, "ip_hour"],
    [{ ipDay: OTP_PER_IP_PER_DAY }, "ip_day"],
    [{ ipWideDay: OTP_PER_WIDE_PER_DAY }, "ip_wide_day"],
    [{ globalHour: 15 }, "global_hour"],
    [{ budgetDay: 80 }, "budget_day"],
  ];
  for (const [counts, limit] of cases) {
    assert.equal(exceededOtpLimit({ ...zero, ...counts }, limits, true), limit);
  }
});

test("a group of ten on one shared WiFi can all sign in within the hour", () => {
  for (let i = 0; i < 10; i++) {
    assert.equal(exceededOtpLimit({ ...zero, ipHour: i, ipDay: i, ipWideDay: i, globalHour: i }, { globalPerHour: 30, budgetPerDay: 80 }, true), null);
  }
});

test("the first limit in order is reported", () => {
  assert.equal(
    exceededOtpLimit({ ...zero, email: 99, ipHour: 99, globalHour: 99 }, limits, true),
    "email",
  );
  assert.equal(exceededOtpLimit({ ...zero, ipHour: 99, budgetDay: 99 }, limits, true), "ip_hour");
});

test("unknown visitor IP skips the per-IP limits but never the global ones", () => {
  assert.equal(exceededOtpLimit({ ...zero, ipHour: 99, ipDay: 99 }, limits, false), null);
  assert.equal(exceededOtpLimit({ ...zero, ipHour: 99, budgetDay: 80 }, limits, false), "budget_day");
});

test("global caps trip with zero per-IP counts", () => {
  assert.equal(exceededOtpLimit({ ...zero, globalHour: 15 }, limits, true), "global_hour");
  assert.ok(isGlobalLimit("global_hour") && isGlobalLimit("budget_day"));
  assert.ok(!isGlobalLimit("email") && !isGlobalLimit("ip_hour"));
});

test("invites: per inviter, then the invite sub-budget, then the shared budget", () => {
  const l = { invitePerDay: 15, budgetPerDay: 80 };
  assert.equal(exceededInviteLimit({ actorDay: 0, inviteDay: 0, budgetDay: 0 }, l), null);
  assert.equal(exceededInviteLimit({ actorDay: INVITES_PER_ACTOR_PER_DAY, inviteDay: 0, budgetDay: 0 }, l), "actor_day");
  assert.equal(exceededInviteLimit({ actorDay: 0, inviteDay: 15, budgetDay: 0 }, l), "invite_day");
  assert.equal(exceededInviteLimit({ actorDay: 0, inviteDay: 0, budgetDay: 80 }, l), "budget_day");
});

test("utcDayStart is the most recent 00:00 UTC", () => {
  const t = Date.UTC(2026, 9, 24, 21, 37, 5) / 1000;
  assert.equal(utcDayStart(t), Date.UTC(2026, 9, 24) / 1000);
  assert.equal(utcDayStart(Date.UTC(2026, 9, 24) / 1000), Date.UTC(2026, 9, 24) / 1000);
});
