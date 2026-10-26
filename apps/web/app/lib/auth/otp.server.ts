import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import type { IpBuckets } from "~/lib/client-ip.server";
import {
  consumeOtp,
  incrementOtpAttempts,
  insertOtp,
  latestActiveOtp,
  otpRequestCounts,
  recordEmailSend,
} from "~/lib/db/queries.server";
import { emailPaused } from "~/lib/email/email.server";
import { env } from "~/lib/env.server";
import { exceededOtpLimit, type OtpLimit } from "./otp-limits.server";

const OTP_TTL_SECONDS = 10 * 60;
const MAX_ATTEMPTS = 5;

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export type OtpRefusal = OtpLimit | "provider_paused";

function decide(counts: ReturnType<typeof otpRequestCounts>, ip: IpBuckets | null): OtpLimit | null {
  return exceededOtpLimit(
    counts,
    { globalPerHour: env.OTP_GLOBAL_MAX_PER_HOUR, budgetPerDay: env.EMAIL_DAILY_BUDGET },
    ip !== null,
  );
}

/**
 * Read-only pre-check with the same limits as generateOtp, for refusing a request before the (awaited)
 * bot check so a flood never reaches Cloudflare. Not authoritative: concurrent requests can pass it
 * together during the await, which is why generateOtp re-checks and inserts synchronously.
 */
export function otpRequestRefusal(email: string, ip: IpBuckets | null): OtpRefusal | null {
  if (emailPaused()) return "provider_paused";
  return decide(otpRequestCounts(email, ip), ip);
}

export type OtpGrant =
  | { ok: true; code: string; sendId: string; budgetUsed: number }
  | { ok: false; limit: OtpRefusal };

/**
 * Check every email limit (otp-limits.server.ts) and, if allowed, issue a 6-digit OTP for `email`:
 * persist only its hash and reserve the email in the ledger. Count, decide and insert run synchronously
 * with no await in between, so on the single Node process concurrent requests can't all pass the same
 * count. Keep it that way. `sendId` must be released with deleteEmailSend if the send fails.
 */
export function generateOtp(email: string, ip: IpBuckets | null): OtpGrant {
  if (emailPaused()) return { ok: false, limit: "provider_paused" };
  const counts = otpRequestCounts(email, ip);
  const limit = decide(counts, ip);
  if (limit) return { ok: false, limit };
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  insertOtp(email, hashCode(code), Math.floor(Date.now() / 1000) + OTP_TTL_SECONDS);
  const sendId = recordEmailSend("otp", { ip });
  return { ok: true, code, sendId, budgetUsed: counts.budgetDay + 1 };
}

/** Verify a submitted code against the newest active OTP for the email (constant-time, single-use). */
export function verifyOtp(email: string, code: string): boolean {
  const row = latestActiveOtp(email);
  if (!row) return false;
  if (row.attempts >= MAX_ATTEMPTS) return false;
  incrementOtpAttempts(row.id);

  const expected = Buffer.from(row.codeHash, "hex");
  const provided = Buffer.from(hashCode(code), "hex");
  const ok = expected.length === provided.length && timingSafeEqual(expected, provided);
  if (ok) consumeOtp(row.id);
  return ok;
}
