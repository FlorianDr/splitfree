import { createTransport } from "nodemailer";
import { env, isProduction, smtp } from "~/lib/env.server";
import { classifySendError, type SendFailure } from "./smtp.server";

function shell(inner: string): string {
  return `<!doctype html>
<html><body style="margin:0;background:#f6f6f7;font-family:'Plus Jakarta Sans',-apple-system,Segoe UI,Roboto,sans-serif;color:#23262B">
  <div style="max-width:460px;margin:0 auto;padding:40px 24px">
    <h1 style="font-size:20px;margin:0 0 16px">split<span style="color:#7B47C4">free</span></h1>
    ${inner}
  </div>
</body></html>`;
}

function otpHtml(code: string): string {
  return shell(
    `<p style="margin:0 0 24px;color:#5b606b">Use this code to sign in. It expires in 10 minutes.</p>
    <div style="font-size:34px;font-weight:700;letter-spacing:8px;background:#fff;border:1px solid #e6e6e9;border-radius:12px;padding:20px;text-align:center;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${code}</div>
    <p style="margin:24px 0 0;color:#9aa0ab;font-size:12px">If you didn't request this, you can ignore this email.</p>`,
  );
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

function inviteHtml(opts: { inviterName: string; billTitle: string; signupUrl: string }): string {
  return shell(
    `<p style="margin:0 0 8px;font-size:16px"><strong>${esc(opts.inviterName)}</strong> added you to an expense:</p>
    <p style="margin:0 0 20px;font-size:20px;font-weight:700">“${esc(opts.billTitle)}”</p>
    <p style="margin:0 0 24px;color:#5b606b">Sign up to see exactly what you owe and settle up — splitfree is completely free.</p>
    <a href="${esc(opts.signupUrl)}" style="display:inline-block;background:#7B47C4;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px">See what you owe →</a>
    <p style="margin:24px 0 0;color:#9aa0ab;font-size:12px">If you don't recognize this, you can ignore this email.</p>`,
  );
}

// One SMTP transport for the process (smtp.server.ts has the settings); null = no SMTP_HOST.
const transport = smtp ? createTransport(smtp) : null;

/** Outcome of a send. Callers release the ledger reservation on failure and tell the user. */
export type SendResult = { ok: true } | { ok: false; reason: SendFailure };

// Once the provider's quota is spent (Resend: `daily_quota_exceeded`, resets 00:00 UTC, or
// `monthly_quota_exceeded`), every further send would fail too. Stop trying until the next UTC
// midnight; a monthly quota just re-pauses each day until it resets.
let pausedUntil = 0;

/** Whether sending is paused because the provider quota is spent. */
export function emailPaused(): boolean {
  return Date.now() < pausedUntil;
}

async function send(
  kind: "otp" | "invite" | "alert",
  message: { to: string; subject: string; text: string; html?: string },
): Promise<SendResult> {
  if (!transport) {
    if (isProduction) {
      console.error(`[email] ${kind} email not sent: SMTP_HOST is not configured`);
      return { ok: false, reason: "error" };
    }
    console.log(`\n[${kind}] to ${message.to}: ${message.text}\n`);
    return { ok: true };
  }
  if (emailPaused()) return { ok: false, reason: "quota" };
  try {
    await transport.sendMail({ from: env.OTP_FROM_EMAIL, ...message });
    return { ok: true };
  } catch (err) {
    const reason = classifySendError(err);
    if (reason === "quota") {
      const d = new Date();
      pausedUntil = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
    }
    const e = err as { code?: string; response?: string; message?: string };
    console.error(`[email] ${kind} email failed (${reason}): ${e.code ?? ""} ${e.response ?? e.message ?? String(err)}`);
    return { ok: false, reason };
  }
}

/** Email an OTP login code. In dev/test with no SMTP_HOST, the code is logged to the console. */
export function sendOtpEmail(to: string, code: string): Promise<SendResult> {
  return send("otp", {
    to,
    subject: `${code} is your splitfree login code`,
    text: `Your splitfree login code is ${code}. It expires in 10 minutes.`,
    html: otpHtml(code),
  });
}

/** Plain-text ops alert to ALERT_EMAIL (see alert.server.ts). */
export function sendAlertEmail(to: string, subject: string, text: string): Promise<SendResult> {
  return send("alert", { to, subject, text });
}

/**
 * Email a brand-new participant that they were added to a bill, with a sign-up link that prefills
 * their email on the login form. Best-effort: the caller never blocks the bill on the result.
 */
export function sendInviteEmail(
  to: string,
  opts: { inviterName: string; billTitle: string; signupUrl: string },
): Promise<SendResult> {
  return send("invite", {
    to,
    subject: `${opts.inviterName} added you to “${opts.billTitle}” on splitfree`,
    text: `${opts.inviterName} added you to the expense "${opts.billTitle}" on splitfree. Sign up to see what you owe and settle up: ${opts.signupUrl}`,
    html: inviteHtml(opts),
  });
}
