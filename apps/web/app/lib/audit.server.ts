import { clientIpFrom, parseIp } from "~/lib/client-ip.server";
import { recordAuditRow } from "~/lib/db/queries.server";
import { env, isProduction } from "~/lib/env.server";
import { createThrottle } from "~/lib/throttle.server";

/**
 * Security audit logging (OWASP A09). A single typed entry point for recording auth events and
 * financial mutations to the append-only `audit_log` table, plus a structured stdout line for
 * ops/Docker-log ingestion. Best-effort: a logging failure is reported but never breaks the request.
 */
export type AuditEvent =
  | "login.otp"
  | "login.otp.fail"
  | "login.passkey"
  | "session.revoke"
  | "bill.create"
  | "bill.delete"
  | "payment.create"
  | "participant.add"
  | "participant.ratelimited"
  | "login.otp.sent"
  | "login.otp.ratelimited"
  | "invite.skipped"
  | "email.send.fail"
  | "login.captcha.fail"
  | "group.create"
  | "group.rename"
  | "group.delete"
  | "group.member.add"
  | "group.member.remove"
  | "group.member.ratelimited"
  | "group.leave"
  | "group.join"
  | "group.link.reset"
  | "group.link.off"
  | "group.link.on";

const ipHeader = env.CLIENT_IP_HEADER?.toLowerCase();
const warnHourly = createThrottle(60 * 60_000);

/**
 * The visitor IP, read only from CLIENT_IP_HEADER (see client-ip.server.ts); null when unconfigured,
 * absent or invalid. In production two tripwires catch a broken proxy setup: the header missing (the
 * proxy stopped setting it), and a CF-Connecting-IP that disagrees with it (a stale Cloudflare range
 * list in Caddy's trusted_proxies, or a forged header on a direct hit).
 */
export function clientIp(request: Request): string | null {
  const ip = clientIpFrom(request.headers, ipHeader);
  if (isProduction && ipHeader) {
    if (!ip && warnHourly("missing").allow) {
      console.error(`[security] ${ipHeader} missing or invalid — check the reverse proxy; per-IP limits skipped`);
    }
    const cf = parseIp(request.headers.get("cf-connecting-ip"));
    if (cf && ip && cf !== ip && warnHourly("cf-mismatch").allow) {
      console.error(`[security] CF-Connecting-IP differs from ${ipHeader} — check Caddy trusted_proxies`);
    }
  }
  return ip;
}

export function audit(input: {
  event: AuditEvent;
  request?: Request;
  actorContactId?: string | null;
  subjectId?: string | null;
  detail?: Record<string, unknown> | null;
}): void {
  const ip = input.request ? clientIp(input.request) : null;
  try {
    recordAuditRow({
      event: input.event,
      actorContactId: input.actorContactId ?? null,
      subjectId: input.subjectId ?? null,
      detail: input.detail ?? null,
      ip,
    });
  } catch (err) {
    console.error("[audit] failed to persist audit event", input.event, err);
  }
  console.log(
    `[audit] ${JSON.stringify({
      event: input.event,
      actor: input.actorContactId ?? null,
      subject: input.subjectId ?? null,
      ip,
    })}`,
  );
}

const auditOnce = createThrottle(10 * 60_000);

/**
 * `audit()` for events a flood can trigger: at most one row per key per 10 minutes, carrying the
 * number of events swallowed since the last one, so bots can't fill the DB or the journal.
 */
export function auditThrottled(key: string, input: Parameters<typeof audit>[0]): void {
  const gate = auditOnce(key);
  if (!gate.allow) return;
  audit({ ...input, detail: { ...input.detail, suppressed: gate.suppressed } });
}
