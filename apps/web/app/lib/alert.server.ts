import { alertSentToday, deleteEmailSend, recordEmailSend } from "~/lib/db/queries.server";
import { sendAlertEmail } from "~/lib/email/email.server";
import { env } from "~/lib/env.server";
import { createThrottle } from "~/lib/throttle.server";

const logOnce = createThrottle(10 * 60_000);
const emailAttemptOnce = createThrottle(10 * 60_000);

/**
 * Ops alert for conditions that pause or threaten email sign-in. Always a `[security]` line in the
 * journal (at most every 10 min per key). With ALERT_EMAIL set, also one email per key per UTC day,
 * deduplicated in the DB so restarts don't resend.
 *
 * Alerts are not counted in the daily email budget (they are the one email we still want once it is
 * spent) but go through the same provider, so a spent provider quota stops them too; the journal line
 * and the `login.otp.ratelimited` / `email.send.fail` audit rows remain.
 */
export function raiseAlert(key: string, message: string): void {
  if (logOnce(key).allow) console.error(`[security] alert ${key}: ${message}`);
  const to = env.ALERT_EMAIL;
  if (!to || !emailAttemptOnce(key).allow || alertSentToday(key)) return;
  const sendId = recordEmailSend("alert", { tag: key });
  void sendAlertEmail(
    to,
    `splitfree alert: ${message}`,
    `${message}\n\nAlert: ${key}\nTime: ${new Date().toISOString()}\n\nDetails: journalctl -t splitfree-app-1 --since -1h`,
  ).then((result) => {
    if (!result.ok) deleteEmailSend(sendId);
  });
}
