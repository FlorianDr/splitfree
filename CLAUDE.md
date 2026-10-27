# splitfree

A completely free, open-source bill-splitting app you can host yourself. Enter bills, record settle-up payments, and
minimize the number of transactions needed to settle a group — always free.

## Guiding principles

### 1. Platform over library
Always prefer Node/web built-ins over a third-party package when a first-class platform primitive
exists. Concrete mapping used in this repo:

| Need | Use (platform) | NOT |
|------|----------------|-----|
| Unit tests | `node:test` + `node:assert/strict`, run with `node --test --experimental-test-coverage` | Vitest/Jest |
| Run TypeScript | Node 26 native type stripping (no build step) | ts-node/tsx for tests |
| SQLite | `node:sqlite` (`DatabaseSync`) + raw SQL + a tiny migration runner | better-sqlite3, Drizzle, Prisma |
| IDs | `crypto.randomUUID()` | nanoid/uuid |
| Hashing / HMAC / JWT | `node:crypto` (`createHash`, `createHmac`, `timingSafeEqual`) — hand-rolled HS256 | jose, jsonwebtoken |
| Random codes | `crypto.randomInt()` | — |
| Money / date formatting | `Intl.NumberFormat` / `Intl.DateTimeFormat` + native `Date` | date-fns, dinero |
| Bot check (Turnstile) | `fetch` + `AbortSignal.timeout` to siteverify; explicit-render `api.js` in an effect | `@marsidev/react-turnstile`, captcha SDKs |

**Justified library exceptions** (no platform equivalent, or user-mandated): React + React Router v8,
Vite, Tailwind v4 + shadcn/ui, `@simplewebauthn/{server,browser}` (WebAuthn), `nodemailer` (SMTP
email: Node has no SMTP client, and SMTP keeps the provider swappable; user-mandated, zero deps),
`@playwright/test` (E2E), `zod` (schema validation — the one acknowledged convenience).
Adding any other runtime dependency requires a deliberate reason recorded here.

### 2. pnpm + monorepo
pnpm is the package manager. The repo is a pnpm-workspace monorepo: `apps/*` and `packages/*`.
- `packages/ledger` (`@splitfree/ledger`) — the pure money math. **Zero runtime dependencies.**
- `apps/web` — the React Router v8 framework app (everything else).

### 3. Money is integer minor units (cents)
Never use floats for money. All amounts are integer cents (`number`). Division (splitting) only happens
in `packages/ledger/src/split.ts` via the **largest-remainder (Hamilton) method**, so no penny is ever
created or lost. Balances are **per-currency** and never mixed (no FX conversion).

### 4. Transactions are the source of truth
The only persisted financial facts are `bills` (+ `bill_participants`) and `payments`. Every balance
and the simplified settle-up plan are **derived** — never stored. Reads use a SQL aggregate
(`SUM(paid_cents - owed_cents) GROUP BY contact_id, currency`), not a full-row load into JS. The pure
functions in `@splitfree/ledger` are the canonical spec and the unit-test target.

### 5. Erasable TypeScript in the ledger
`packages/ledger` must use erasable-TS only (string-literal unions, `import type`, no `enum`/
`namespace`/parameter-properties) so Node's native type stripping runs it directly under `node:test`.

### 6. `.server.ts` convention
Anything that touches the DB, secrets, or Node-only APIs gets a `.server.ts` suffix so React
Router/Vite guarantees it never ships to the client bundle. The `@splitfree/ledger` package is
deliberately isomorphic (safe in the browser for live split previews) and is NOT `.server`.

## The debt-simplification math
Minimizing settle-up transactions is the NP-hard "debts'-clearing / minimum-cash-flow" problem
(reduces to subset-sum). We ship the standard **greedy net-balance heuristic**: net each person's
balance, repeatedly match the largest creditor with the largest-magnitude debtor transferring
`min(|c|, |d|)`. Always settles everyone to zero; emits **≤ n−1** transfers. See `packages/ledger`.

The settle-up plan covers the viewer's **circle** (everyone linked through bills and payments,
transitively: `listSettleCircle`, then the `getNetBalances` aggregate), never just the viewer's own
bills. Otherwise, when no one is on every bill, members get contradicting plans and net creditors are
told to pay (`tests/e2e/settle.spec.ts`). Each person sees **only their own transfers**
(`lib/settle.server.ts` `mySettleTransfers`): on `/settle`, on home (default "Simplified"; "All
balances" = `?view=all`, the pairwise list) and on a person's page. Never list other people's
transfers. A counterparty outside the viewer's shared history is shown by email.

## Commands
- `pnpm test` — run the ledger unit suite (`node:test`) with coverage.
- `pnpm --filter web dev` — run the web app in dev.
- `pnpm --filter web build` / `pnpm --filter web start` — build / serve.
- `pnpm typecheck` — typecheck all workspaces.
- `pnpm --filter web exec playwright test` — E2E.

## Data durability (never lose the DB)
The DB is a **host bind mount** at `${DATA_DIR:-./data}/splitfree.db` (not a named volume — survives
`down -v`). Off-site backup is **Litestream** (config `litestream.yml`, run as a sidecar sharing `/data`, with a
restore-if-missing step before the app starts): continuous WAL replication to S3-compatible object
storage with point-in-time restore, and restore-on-boot when the DB is missing. In-app, `migrate.server.ts`
takes a `VACUUM INTO` snapshot *before* any schema migration on an existing DB (fail-closed in prod), pure
`node:sqlite`.
Health probe: `GET /healthz`.

## Environment
Node **26** (pinned in `.node-version`). Run the server with
`NODE_OPTIONS=--disable-warning=ExperimentalWarning` to silence the `node:sqlite` experimental notice.
Required env vars (validated in `apps/web/app/lib/env.server.ts`): `JWT_SECRET`, `SMTP_HOST`
(+ `SMTP_PORT`, `SMTP_SECURITY`, `SMTP_USER`, `SMTP_PASSWORD`; settings in `lib/email/smtp.server.ts`),
`OTP_FROM_EMAIL`, `WEBAUTHN_RP_ID`, `WEBAUTHN_RP_NAME`, `WEBAUTHN_ORIGIN`, `DATABASE_PATH`. Test-only:
`ALLOW_TEST_LOGIN=1` (never set in production).

**`apps/web/server.js` is the production entry** (`start` script and Dockerfile `CMD`), not
`build/server/index.js`. It re-exports the build with `allowedActionOrigins` set from `WEBAUTHN_ORIGIN`:
behind Caddy the app sees `http://` while browsers send an `https://` Origin, and React Router ≥ 7.18.3
rejects every action (including logout) with a 400 on that scheme mismatch. Dev and E2E run on
`http://localhost`, so they can't catch a break here; check with a production build behind an https
Origin.

## Groups and join links
A group (`split_groups` + `split_group_members`, migration 0004) is a shared, named list of emails.
- **Members are stored as emails, never as contacts.** Saving a group creates no contacts and sends no
  email, so the bill flow still invites people and applies the new-people limit when a bill includes
  them. Don't "optimize" this by upserting contacts on group save.
- **Groups expand in the browser** into ordinary bill participants (`lib/groups.ts` `mergeMembers`);
  bills never reference a group, so editing/deleting a group never rewrites history.
- **Visibility:** members only (`requireGroupMember` → 404 for everyone else). Any member adds people
  and can leave; only the creator removes, renames, deletes and manages the join link (403).
- **Names:** a member's display name is shown only to people who share bill/payment history with them
  (`lib/people.server.ts`); otherwise the email. Never join group members to `contacts` for names.
- **Join link:** 32 random bytes, valid four weeks (`JOIN_LINK_TTL_SECONDS`), reset = new token.
  Opening it never joins (the POST behind "Join group" does). Signed-out visitors go through
  `/login?redirectTo=…` (`requireUser` adds it for GETs; `lib/redirect.ts` keeps it same-site).

## Outbound email limits (bot protection)
A bot once used `/login` to make us email codes to arbitrary addresses. Every outbound email is now
reserved in the `email_sends` ledger before sending (and released if the provider rejects it), and
limits are pure functions in `apps/web/app/lib/auth/otp-limits.server.ts`: per email, per visitor IP
(IPv4 / IPv6 /64, plus /24 / /48), per hour globally, and a daily budget per UTC day shared by login
codes and invites (`EMAIL_DAILY_BUDGET`, `INVITE_DAILY_BUDGET`, `OTP_GLOBAL_MAX_PER_HOUR`; defaults fit
Resend's free tier). Count → decide → insert must stay synchronous (no `await`) in `generateOtp`.
Per-IP limits are loose on purpose (10/h, 30/day per IPv4 or IPv6 /64): groups share one WiFi, and
Turnstile is the main bot gate. Only the daily budget is tied to the email provider's quota.
- **Visitor IP** comes only from `CLIENT_IP_HEADER`, a header the reverse proxy overwrites (Caddy
  `header_up X-Real-IP {client_ip}`). Never read X-Forwarded-For or CF-Connecting-IP for limits.
- Email goes out over SMTP only (`lib/email/email.server.ts`); never add a provider SDK or API. A
  spent provider quota (recognized by its SMTP reply text, `classifySendError`) pauses sending until
  00:00 UTC (`emailPaused()`); the user sees an honest error, never "we emailed you a code" for an
  email that wasn't sent.
- Alerts (`alert.server.ts`): a `[security]` journal line, plus one email per kind per UTC day to
  `ALERT_EMAIL`. Flood-able audit events go through `auditThrottled`.
- Retention: `email_sends` and `otp_codes` 2 days, `audit_log` 90 days (pruned on each ledger insert);
  the privacy policy states these periods.
- **Turnstile** guards the email-code request (`login.tsx`): read-only limit pre-check → siteverify
  (`turnstile.server.ts`, fail closed, hostname/action checked only with live keys) → `generateOtp`.
  `TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET_KEY` are both-or-neither; neither = the check is off in every
  environment (no widget, no siteverify). E2E sets Cloudflare's always-pass test keys and posts the
  dummy token from `tests/e2e/fixtures.ts`. Turnstile does not need a Cloudflare proxy in front of the
  site.
