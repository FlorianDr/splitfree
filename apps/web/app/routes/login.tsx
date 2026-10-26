import { ArrowLeftRight, Check, Fingerprint, Receipt, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { data, Form, Link, redirect, useNavigate, useNavigation } from "react-router";
import { toast } from "sonner";
import type { Route } from "./+types/login";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { createUserSessionCookie } from "~/lib/auth/session.server";
import { isGlobalLimit } from "~/lib/auth/otp-limits.server";
import { generateOtp, type OtpRefusal, otpRequestRefusal, verifyOtp } from "~/lib/auth/otp.server";
import { isTurnstileTestKey, verifyTurnstileToken } from "~/lib/auth/turnstile.server";
import { sendOtpEmail } from "~/lib/email/email.server";
import {
  deleteEmailSend,
  findOrCreateVerifiedUser,
  listCredentialsByUser,
} from "~/lib/db/queries.server";
import { loginWithPasskey } from "~/lib/auth/passkey";
import { raiseAlert } from "~/lib/alert.server";
import { audit, auditThrottled, clientIp } from "~/lib/audit.server";
import { type IpBuckets, ipBuckets } from "~/lib/client-ip.server";
import { TurnstileWidget } from "~/components/turnstile-widget";
import { env, turnstile } from "~/lib/env.server";
import { flashCookie } from "~/lib/flash.server";
import { pageMeta } from "~/lib/meta";
import { safeRedirectPath, withParam } from "~/lib/redirect";

export function meta({ matches }: Route.MetaArgs) {
  return pageMeta(matches, { path: "/login" });
}

export async function loader({ request }: Route.LoaderArgs) {
  // The _auth layout already redirects signed-in users. Read an optional prefill email (from an
  // invite link, e.g. /login?email=foo@bar.com).
  const url = new URL(request.url);
  return {
    prefillEmail: url.searchParams.get("email") ?? "",
    // Where to go after signing in (e.g. back to a group join link); same-site paths only.
    redirectTo: safeRedirectPath(url.searchParams.get("redirectTo")),
    // Null when the bot check is off (production without Turnstile keys).
    turnstileSiteKey: turnstile?.siteKey ?? null,
  };
}

/** The Turnstile `action` this form's widget is rendered with; checked server-side with live keys. */
const TURNSTILE_ACTION = "login-request";

// The same messages whether or not the address has an account (no enumeration).
const TOO_MANY = "Too many codes requested. Try again later.";
const PAUSED = "Email sign-in is temporarily unavailable. Please try again later or sign in with a passkey.";
const SEND_FAILED = "We couldn't send the email. Please try again in a few minutes or sign in with a passkey.";
const NO_CAPTCHA = "Please enable JavaScript and complete the check to sign in by email.";
const CAPTCHA_FAILED = "We couldn't verify you're human. Please try again.";

/** Audit + alert + response for a request refused by an email limit (pre-check or generateOtp). */
function refuse(request: Request, email: string, ip: IpBuckets | null, limit: OtpRefusal) {
  const everyone = limit === "provider_paused" || isGlobalLimit(limit);
  const who = everyone ? "*" : limit === "email" ? email : (ip?.narrow ?? "?");
  auditThrottled(`otp:${limit}:${who}`, {
    event: "login.otp.ratelimited",
    request,
    detail: { limit, ipBucket: ip?.narrow ?? null },
  });
  if (everyone) raiseAlert(`otp-${limit}`, `email sign-in paused (${limit})`);
  return data({ step: "request" as const, email, error: everyone ? PAUSED : TOO_MANY }, { status: 429 });
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const email = String(form.get("email") ?? "").trim().toLowerCase();

  if (intent === "request") {
    if (!email || email.length > 254 || !email.includes("@")) {
      return { step: "request" as const, error: "Enter a valid email address." };
    }
    const remoteip = clientIp(request);
    const ip = ipBuckets(remoteip);
    // 1. Cheap read-only limit check first, so a flood is refused before any call to Cloudflare.
    const refusal = otpRequestRefusal(email, ip);
    if (refusal) return refuse(request, email, ip, refusal);
    // 2. Bot check (Turnstile). Hostname and action are only checked with live keys: Cloudflare's test
    //    keys answer with `action: "test"` and the dev hostname.
    if (turnstile) {
      const live = !isTurnstileTestKey(turnstile.secretKey);
      const captcha = await verifyTurnstileToken({
        secret: turnstile.secretKey,
        token: String(form.get("cf-turnstile-response") ?? ""),
        remoteip,
        expectedHostname: live ? new URL(env.WEBAUTHN_ORIGIN).hostname : undefined,
        expectedAction: live ? TURNSTILE_ACTION : undefined,
      });
      if (!captcha.ok) {
        auditThrottled(`captcha:${captcha.reason}:${ip?.narrow ?? "?"}`, {
          event: "login.captcha.fail",
          request,
          detail: { reason: captcha.reason, codes: captcha.codes ?? null, ipBucket: ip?.narrow ?? null },
        });
        const unavailable = captcha.reason === "unavailable";
        return data(
          { step: "request" as const, email, error: captcha.reason === "missing" ? NO_CAPTCHA : unavailable ? PAUSED : CAPTCHA_FAILED },
          { status: unavailable ? 503 : 400 },
        );
      }
    }
    // 3. Authoritative limit check + reservation (synchronous, see generateOtp).
    const otp = generateOtp(email, ip);
    if (!otp.ok) return refuse(request, email, ip, otp.limit);
    if (otp.budgetUsed >= Math.ceil(env.EMAIL_DAILY_BUDGET * 0.6)) {
      raiseAlert("email-budget-60", `${otp.budgetUsed} of ${env.EMAIL_DAILY_BUDGET} daily emails used`);
    }
    audit({ event: "login.otp.sent", request, detail: { ipBucket: ip?.narrow ?? null } });
    const sent = await sendOtpEmail(email, otp.code);
    if (!sent.ok) {
      deleteEmailSend(otp.sendId);
      auditThrottled(`send:otp:${sent.reason}`, {
        event: "email.send.fail",
        request,
        detail: { kind: "otp", reason: sent.reason },
      });
      if (sent.reason === "quota") {
        raiseAlert("provider-quota", "email provider quota spent, email sign-in paused until 00:00 UTC");
      }
      return data(
        { step: "request" as const, email, error: sent.reason === "quota" ? PAUSED : SEND_FAILED },
        { status: 503 },
      );
    }
    return { step: "verify" as const, email };
  }

  if (intent === "verify") {
    const code = String(form.get("code") ?? "").trim();
    if (!verifyOtp(email, code)) {
      audit({ event: "login.otp.fail", request, detail: { email } });
      return { step: "verify" as const, email, error: "Invalid or expired code." };
    }
    const { user, contact } = findOrCreateVerifiedUser(email);
    audit({ event: "login.otp", request, actorContactId: contact.id, subjectId: user.id });
    const hasPasskey = listCredentialsByUser(user.id).length > 0;
    const headers = new Headers();
    headers.append("Set-Cookie", createUserSessionCookie(user.id, contact.id));
    const redirectTo = safeRedirectPath(form.get("redirectTo"));
    if (hasPasskey) {
      headers.append("Set-Cookie", flashCookie("success", "Signed in"));
      return redirect(redirectTo, { headers });
    }
    // First login (incl. a brand-new sign-up) without a passkey → land where the link wanted, with the
    // passkey setup modal open (PasskeyPrompt lives in the _app layout, so it opens on any app page).
    return redirect(withParam(redirectTo, "passkey", "setup"), { headers });
  }

  return { step: "request" as const, error: "Unknown action." };
}

const FEATURES = [
  { icon: Receipt, text: "Enter a bill and split it equally — or set exactly who paid and who owes." },
  { icon: ArrowLeftRight, text: "We minimize the number of payments needed to settle everyone up." },
  { icon: ShieldCheck, text: "Passwordless sign-in by email code or passkey. No paywall, ever." },
];

export default function Login({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const navigate = useNavigate();
  const busy = navigation.state !== "idle";
  const step = actionData?.step ?? "request";
  const email =
    (actionData && "email" in actionData ? actionData.email : "") || loaderData.prefillEmail;
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const needsCaptcha = loaderData.turnstileSiteKey !== null;

  // Toasts for the in-page action results (errors + "code sent"); success sign-in is flashed by root.
  useEffect(() => {
    if (!actionData) return;
    const err = "error" in actionData ? actionData.error : undefined;
    if (err) toast.error(err);
    else if (actionData.step === "verify") toast.success("We emailed you a code.");
  }, [actionData]);

  return (
    <div className="w-full max-w-5xl">
    <div className="grid w-full overflow-hidden rounded-2xl border bg-card shadow-sm lg:grid-cols-[1.618fr_1fr]">
      {/* Hero (the larger, golden-ratio side) */}
      <div className="hidden flex-col justify-between gap-10 bg-primary p-10 text-primary-foreground lg:flex">
        <div>
          <p className="font-display text-3xl font-bold tracking-tight">
            split<span className="opacity-70">free</span>
          </p>
          <h2 className="mt-6 font-display text-3xl font-semibold leading-tight">
            Share expenses with friends. Settle up in the fewest payments.
          </h2>
          <p className="mt-3 text-primary-foreground/80">
            A completely free, open-source bill-splitting app you can host yourself. Adding bills is
            never behind a paywall.
          </p>
        </div>
        <ul className="space-y-4">
          {FEATURES.map((f) => (
            <li key={f.text} className="flex items-center gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/15">
                <f.icon className="size-4" />
              </span>
              <span className="text-sm text-primary-foreground/90">{f.text}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-primary-foreground/60">Always free. No ads. Your data, your server.</p>
      </div>

      {/* Auth — vertically centered next to the taller hero column. p-5 leaves the Turnstile widget
          its 300 px "flexible" size on a 375 px phone. */}
      <div className="flex flex-col justify-center p-5 sm:p-10">
        <div className="mb-6 lg:hidden">
          <p className="font-display text-2xl font-bold">
            split<span className="text-primary">free</span>
          </p>
        </div>

        <h1 className="font-display text-2xl font-semibold">
          {step === "verify" ? "Check your email" : "Sign in"}
        </h1>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">
          {step === "verify"
            ? `Enter the 6-digit code we sent to ${email}.`
            : "We'll email you a one-time code — no password needed."}
        </p>

        {step === "request" ? (
          <Form method="post" className="space-y-3">
            <input type="hidden" name="intent" value="request" />
            <input type="hidden" name="redirectTo" value={loaderData.redirectTo} />
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email webauthn"
                placeholder="you@example.com"
                required
                autoFocus={!email}
                defaultValue={email}
              />
            </div>
            {loaderData.turnstileSiteKey && (
              <>
                <TurnstileWidget
                  siteKey={loaderData.turnstileSiteKey}
                  action={TURNSTILE_ACTION}
                  resetSignal={actionData}
                  onToken={setCaptchaToken}
                />
                <noscript>
                  <p className="text-sm text-muted-foreground">
                    Signing in by email needs JavaScript for a quick human check.
                  </p>
                </noscript>
              </>
            )}
            <Button type="submit" className="w-full" disabled={busy || (needsCaptcha && !captchaToken)}>
              {busy ? "Sending…" : "Email me a code"}
            </Button>
          </Form>
        ) : (
          <Form method="post" className="space-y-3">
            <input type="hidden" name="intent" value="verify" />
            <input type="hidden" name="redirectTo" value={loaderData.redirectTo} />
            <input type="hidden" name="email" value={email} />
            <div className="space-y-1.5">
              <Label htmlFor="code">Login code</Label>
              <Input
                id="code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="123456"
                required
                autoFocus
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Verifying…" : "Sign in"}
            </Button>
          </Form>
        )}

        <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          or
          <div className="h-px flex-1 bg-border" />
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={passkeyBusy}
          onClick={async () => {
            setPasskeyBusy(true);
            const ok = await loginWithPasskey();
            setPasskeyBusy(false);
            if (ok) {
              toast.success("Signed in");
              navigate(loaderData.redirectTo);
            } else {
              toast.error("Passkey sign-in failed or was cancelled.");
            }
          }}
        >
          <Fingerprint className="size-4" />
          {passkeyBusy ? "Waiting for passkey…" : "Sign in with passkey"}
        </Button>

        <p className="mt-4 text-xs text-muted-foreground">
          By continuing, you agree to our{" "}
          <Link to="/terms" className="underline hover:text-foreground">
            Terms
          </Link>{" "}
          and{" "}
          <Link to="/privacy" className="underline hover:text-foreground">
            Privacy Policy
          </Link>
          .
        </p>

        <ul className="mt-6 space-y-1.5 text-xs text-muted-foreground lg:hidden">
          {FEATURES.map((f) => (
            <li key={f.text} className="flex items-start gap-2">
              <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
              {f.text}
            </li>
          ))}
        </ul>
      </div>
    </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        <Link to="/terms" className="hover:text-foreground">
          Terms
        </Link>
        <span className="mx-2">·</span>
        <Link to="/privacy" className="hover:text-foreground">
          Privacy
        </Link>
        <span className="mx-2">·</span>
        <Link to="/impressum" className="hover:text-foreground">
          Impressum
        </Link>
      </p>
    </div>
  );
}
