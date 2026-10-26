/**
 * Abuse limits for outbound email. Pure decisions over counts the caller reads from `email_sends`, so
 * node:test can load this file directly.
 *
 * Why: a bot used the login form to make us email codes to arbitrary addresses. Each limit closes one
 * way around the others — per email, per visitor IP (narrow + wide bucket), a global hourly cap, and a
 * daily budget shared by login codes and invites that stays under the email provider's quota (Resend's
 * free tier: 100/day, resetting at 00:00 UTC, which is why the budget counts per UTC day).
 */

// Per-IP limits are deliberately loose: a group of friends on one WiFi shares a single IPv4 address,
// and Turnstile (turnstile.server.ts) is the main gate against scripts. These are the backstop, sized
// so about ten people behind one router can all sign in within the same hour.
export const OTP_PER_EMAIL_PER_HOUR = 5;
export const OTP_PER_IP_PER_HOUR = 10;
export const OTP_PER_IP_PER_DAY = 30;
export const OTP_PER_WIDE_PER_DAY = 60;
export const INVITES_PER_ACTOR_PER_DAY = 10;

export type OtpLimit = "email" | "ip_hour" | "ip_day" | "ip_wide_day" | "global_hour" | "budget_day";

export interface OtpCounts {
  /** Codes for this email in the last hour. */
  email: number;
  /** Codes for this visitor's narrow bucket in the last hour / 24 h, and its wide bucket in 24 h. */
  ipHour: number;
  ipDay: number;
  ipWideDay: number;
  /** All codes in the last hour. */
  globalHour: number;
  /** Codes + invites since 00:00 UTC. */
  budgetDay: number;
}

export interface OtpLimits {
  globalPerHour: number;
  budgetPerDay: number;
}

/**
 * The first limit this request would exceed (counts are taken before inserting, hence `>=`), or null.
 * Per-IP limits only apply when the visitor IP is known; the global ones always do.
 */
export function exceededOtpLimit(c: OtpCounts, l: OtpLimits, ipKnown: boolean): OtpLimit | null {
  if (c.email >= OTP_PER_EMAIL_PER_HOUR) return "email";
  if (ipKnown) {
    if (c.ipHour >= OTP_PER_IP_PER_HOUR) return "ip_hour";
    if (c.ipDay >= OTP_PER_IP_PER_DAY) return "ip_day";
    if (c.ipWideDay >= OTP_PER_WIDE_PER_DAY) return "ip_wide_day";
  }
  if (c.globalHour >= l.globalPerHour) return "global_hour";
  if (c.budgetDay >= l.budgetPerDay) return "budget_day";
  return null;
}

/** Limits that pause email sign-in for everyone (as opposed to one visitor or address). */
export function isGlobalLimit(limit: OtpLimit): boolean {
  return limit === "global_hour" || limit === "budget_day";
}

export type InviteLimit = "actor_day" | "invite_day" | "budget_day";

export interface InviteCounts {
  /** Invites this inviter sent since 00:00 UTC. */
  actorDay: number;
  /** All invites since 00:00 UTC. */
  inviteDay: number;
  /** Codes + invites since 00:00 UTC. */
  budgetDay: number;
}

export interface InviteLimits {
  invitePerDay: number;
  budgetPerDay: number;
}

/** The first limit one more invite email would exceed, or null. Invites are best-effort: skipped, never fatal. */
export function exceededInviteLimit(c: InviteCounts, l: InviteLimits): InviteLimit | null {
  if (c.actorDay >= INVITES_PER_ACTOR_PER_DAY) return "actor_day";
  if (c.inviteDay >= l.invitePerDay) return "invite_day";
  if (c.budgetDay >= l.budgetPerDay) return "budget_day";
  return null;
}

/** Unix seconds of the most recent 00:00 UTC. */
export function utcDayStart(nowSeconds: number): number {
  return nowSeconds - (nowSeconds % 86_400);
}
