import { z } from "zod";
import { resolveJwtSecret } from "~/lib/auth/jwt-secret.server";
import { resolveTurnstileKeys } from "~/lib/auth/turnstile.server";
import { smtpTransportOptions } from "~/lib/email/smtp.server";

/**
 * Validated process environment. Imported by anything that needs config. Crashes fast at boot
 * (module load) if a required var is missing in production. See .env.example for the full list.
 */
const isProd = process.env.NODE_ENV === "production";

// Compose passes unset optional vars as "", which must mean "use the default", not 0 or invalid.
const blankToUndefined = (v: unknown) => (v === "" ? undefined : v);
const positiveInt = (fallback: number) =>
  z.preprocess(blankToUndefined, z.coerce.number().int().positive().default(fallback));

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  // 32+ char secret for signing session JWTs. Required in production; dev gets a random per-boot
  // value (see resolveJwtSecret — never a hard-coded constant).
  JWT_SECRET: z.string().min(32),
  // Outbound email over SMTP (lib/email/smtp.server.ts), any provider. Resend: SMTP_HOST=smtp.resend.com,
  // SMTP_USER=resend, SMTP_PASSWORD=<API key>. SMTP_SECURITY defaults to tls on 465/2465, else starttls.
  // No SMTP_HOST: in dev/test emails (and OTP codes) are logged to the console; production can't send.
  SMTP_HOST: z.preprocess(blankToUndefined, z.string().optional()),
  SMTP_PORT: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(65535).default(465)),
  SMTP_SECURITY: z.preprocess(blankToUndefined, z.enum(["tls", "starttls", "none"]).optional()),
  SMTP_USER: z.preprocess(blankToUndefined, z.string().optional()),
  SMTP_PASSWORD: z.preprocess(blankToUndefined, z.string().optional()),
  OTP_FROM_EMAIL: z.string().default("splitfree <login@splitfree.cash>"),
  WEBAUTHN_RP_ID: z.string().default("localhost"),
  WEBAUTHN_RP_NAME: z.string().default("splitfree"),
  WEBAUTHN_ORIGIN: z.string().default("http://localhost:3000"),
  DATABASE_PATH: z.string().default("./splitfree.db"),
  // Test-only gate for the Playwright auth-mock login route. Never set in production.
  ALLOW_TEST_LOGIN: z.string().optional(),
  // The ONE request header carrying the visitor IP, set by a reverse proxy that OVERWRITES it (Caddy:
  // `header_up X-Real-IP {client_ip}` → "x-real-ip"). Unset = trust no header: per-IP email limits are
  // off, the global ones still apply. Never name a header clients can pass through unchanged.
  CLIENT_IP_HEADER: z.preprocess(blankToUndefined, z.string().optional()),
  // Outbound email budget (otp-limits.server.ts). Defaults fit Resend's free tier (100/day): login
  // codes + invites per UTC day, invites' share of that, and login codes per hour.
  EMAIL_DAILY_BUDGET: positiveInt(80),
  INVITE_DAILY_BUDGET: positiveInt(15),
  OTP_GLOBAL_MAX_PER_HOUR: positiveInt(30),
  // Where "email sign-in paused" alerts go, one per kind per UTC day (alert.server.ts). Optional.
  ALERT_EMAIL: z.preprocess(blankToUndefined, z.email().optional()),
  // Cloudflare Turnstile bot check on the email sign-in (turnstile.server.ts). Both or neither; neither
  // turns the check off. Production rejects Cloudflare's test keys.
  TURNSTILE_SITE_KEY: z.preprocess(blankToUndefined, z.string().optional()),
  TURNSTILE_SECRET_KEY: z.preprocess(blankToUndefined, z.string().optional()),
});

const raw = {
  ...process.env,
  // Dev/test convenience: boot without a .env using a RANDOM per-process secret (never a shipped
  // constant). In production a missing secret stays undefined so the schema below fails closed.
  JWT_SECRET: resolveJwtSecret(process.env.JWT_SECRET, isProd),
};

const parsed = schema.safeParse(raw);
if (!parsed.success) {
  console.error(
    "[env] Invalid environment configuration:",
    JSON.stringify(parsed.error.issues, null, 2),
  );
  throw new Error("Invalid environment configuration — see logs above.");
}

export const env = parsed.data;

/** Turnstile keys, or null when the bot check is off (no keys configured, e.g. a self-host). */
export const turnstile = resolveTurnstileKeys(env.TURNSTILE_SITE_KEY, env.TURNSTILE_SECRET_KEY, isProd);

if (isProd && !turnstile) {
  console.warn("[env] TURNSTILE_SITE_KEY/TURNSTILE_SECRET_KEY not set: email sign-in has no bot check.");
}

/** nodemailer SMTP options, or null when SMTP_HOST is unset. */
export const smtp = smtpTransportOptions(
  {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    security: env.SMTP_SECURITY,
    user: env.SMTP_USER,
    password: env.SMTP_PASSWORD,
  },
  isProd,
);

if (isProd && !smtp) {
  console.error(
    process.env.RESEND_API_KEY
      ? "[env] RESEND_API_KEY is no longer read: set SMTP_HOST=smtp.resend.com, SMTP_USER=resend and SMTP_PASSWORD=<the API key>. No email can be sent until then."
      : "[env] SMTP_HOST is not set: no email can be sent, so email sign-in and invites fail.",
  );
}

if (isProd && !env.CLIENT_IP_HEADER) {
  console.warn(
    "[env] CLIENT_IP_HEADER is not set: per-IP email limits are off (global limits still apply).",
  );
}

export const allowTestLogin = env.ALLOW_TEST_LOGIN === "1" && !isProd;
export const isProduction = isProd;
