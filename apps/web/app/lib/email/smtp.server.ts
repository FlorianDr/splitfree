/**
 * SMTP settings and error mapping for outbound email (sent with nodemailer in email.server.ts). Any
 * provider works, e.g. Resend: host `smtp.resend.com`, user `resend`, the API key as the password.
 * Pure — no env, no `~/` imports — so node:test can load it.
 */
import type { SMTPTransportOptions } from "nodemailer/lib/smtp-transport";

/** `tls`: TLS from the first byte (port 465). `starttls`: upgrade required (587). `none`: dev only. */
export type SmtpSecurity = "tls" | "starttls" | "none";

export interface SmtpSettings {
  host?: string;
  port: number;
  security?: SmtpSecurity;
  user?: string;
  password?: string;
}

/** Ports where the connection is TLS from the start (RFC 8314); every other port must STARTTLS. */
const IMPLICIT_TLS_PORTS = new Set([465, 2465]);

/**
 * nodemailer transport options for the SMTP_* settings, or null when no host is set (email is then
 * logged in dev and fails in production). Throws on a config that can't be right, at boot.
 */
export function smtpTransportOptions(s: SmtpSettings, production: boolean): SMTPTransportOptions | null {
  if (!s.host) return null;
  if (Boolean(s.user) !== Boolean(s.password)) {
    throw new Error("Set both SMTP_USER and SMTP_PASSWORD, or neither.");
  }
  const security = s.security ?? (IMPLICIT_TLS_PORTS.has(s.port) ? "tls" : "starttls");
  if (security === "none" && production) {
    throw new Error("SMTP_SECURITY=none sends credentials and mail unencrypted; use tls or starttls.");
  }
  return {
    host: s.host,
    port: s.port,
    secure: security === "tls",
    // Never continue in plaintext when STARTTLS is missing or fails.
    requireTLS: security === "starttls",
    ignoreTLS: security === "none",
    auth: s.user ? { user: s.user, pass: s.password } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  };
}

/** Why a send failed. Callers release the ledger reservation and tell the user. */
export type SendFailure = "quota" | "transient" | "rejected" | "error";

/**
 * Classify a nodemailer error. A spent account quota (Resend's `daily_quota_exceeded`, Gmail's "daily
 * sending limit") is told apart by its reply text, since SMTP has no code for it; other 4xx replies
 * are transient, 5xx rejections. No SMTP reply at all (DNS, connection, TLS, timeout) is `error`.
 */
export function classifySendError(err: unknown): SendFailure {
  const e = (err ?? {}) as { responseCode?: unknown; response?: unknown; message?: unknown };
  if (typeof e.responseCode !== "number") return "error";
  if (/quota|sending limit/i.test(`${String(e.response ?? "")} ${String(e.message ?? "")}`)) return "quota";
  return e.responseCode >= 400 && e.responseCode < 500 ? "transient" : "rejected";
}
