# splitfree

A completely free, open-source bill-splitting app you can host yourself. Add bills, split them any
way you like, record payments, and settle up a group in the **fewest possible payments**. No ads, no
paywall, no limit on how many bills you can add.

A hosted instance runs at [splitfree.cash](https://splitfree.cash).

## Features

- **Bills, split your way:** equally, by exact amounts, by percentages or by shares, with one or more
  people paying.
- **Settle up in the fewest payments:** splitfree nets everyone's balances and suggests the smallest
  set of payments that clears them.
- **Payments:** record who paid whom to settle a balance.
- **Groups:** save the people you share costs with, and invite others with a join link.
- **Multiple currencies:** balances are kept per currency and never converted.
- **No passwords:** sign in with a one-time email code or a passkey.
- **Email invites:** people you add to a bill get an email to sign up and see what they owe.
- **Works on your phone:** installable as a web app.

## Why

Some popular bill-splitting apps now limit how many expenses you can add for free. splitfree keeps
the essentials free and runs anywhere with Docker and a single SQLite file.

## Self-hosting

You need Docker, a domain with HTTPS (passkeys require it), an SMTP provider for sign-in emails, and
an S3-compatible bucket for backups.

### Try it locally

```bash
cp .env.example .env   # set JWT_SECRET, SMTP_*, WEBAUTHN_RP_ID and WEBAUTHN_ORIGIN
docker compose up --build
```

This runs the app alone on port 3000, without off-site backups.

### Production

Build the image (`docker build -t splitfree .`, or start from [docker-compose.yml](docker-compose.yml))
and configure it with the settings in [.env.production.example](.env.production.example):

```bash
cp .env.production.example .env.production && chmod 600 .env.production   # then fill it in
```

- Mount a host directory at `/data` for the database. It must be writable by uid 1000, the user the
  container runs as: `sudo chown -R 1000:1000 data`.
- Publish the app on loopback only and put a TLS-terminating reverse proxy in front. `WEBAUTHN_RP_ID`
  must match your domain.
- The proxy must **overwrite** one header with the visitor's IP, and `CLIENT_IP_HEADER` must name it
  (with Caddy: `header_up X-Real-IP {client_ip}` and `CLIENT_IP_HEADER=x-real-ip`). The per-IP email
  limits rely on it.
- Health check: `GET /healthz`.

### Configuration

All settings are environment variables, validated at startup. Both example files document every one
of them; the main ones are:

| Variable | Purpose |
|----------|---------|
| `JWT_SECRET` | Signs session cookies. Generate with `openssl rand -base64 48`. |
| `WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGIN` | Your domain and public URL, for passkeys. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | Outgoing email, any provider. For Resend: `smtp.resend.com`, user `resend`, your API key as the password. |
| `OTP_FROM_EMAIL` | Sender of sign-in codes and invites, on a domain your provider has verified. |
| `CLIENT_IP_HEADER` | The header your proxy sets to the visitor's IP. |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Optional Cloudflare Turnstile bot check on email sign-in. Unset means off. |
| `LITESTREAM_*` | Bucket, endpoint, region and keys for backups. |

### Backups

The database is a single SQLite file, `/data/splitfree.db`, on the host directory you mount, so
removing the container never deletes it. Back it up with [Litestream](https://litestream.io), using
[litestream.yml](litestream.yml): run the `litestream/litestream` image next to the app with the same
`/data` mount, the config at `/etc/litestream.yml` and the `LITESTREAM_*` settings.

- **Continuous replication** (`litestream replicate`): every committed change streams to your
  S3-compatible bucket within about a second, plus a full snapshot daily kept for 7 days. You can
  restore to any moment in the last week.
- **Restore on boot:** run `litestream restore -if-db-not-exists -if-replica-exists
  /data/splitfree.db` before the app starts, and a new server (or a lost disk) restores itself.
- **Before every schema migration,** the app also writes a snapshot to `/data/backups/`.

Keep the bucket private: Litestream doesn't encrypt the copy. Never point a second Litestream (for
example on a dev machine) at the same bucket path; two writers can corrupt the replica.

To restore by hand, stop the app and Litestream first, keep the current file aside, then restore:

```bash
mv data/splitfree.db data/splitfree.db.before-restore
rm -f data/splitfree.db-wal data/splitfree.db-shm
docker run --rm --user 1000:1000 --env-file .env.production \
  -v "$PWD/data:/data" -v "$PWD/litestream.yml:/etc/litestream.yml:ro" \
  litestream/litestream:0.5.17 restore -integrity-check full /data/splitfree.db
# or a moment in time (UTC): add  -timestamp 2026-10-24T12:00:00Z  before /data/splitfree.db
```

## How settling up works

Finding the absolute minimum number of payments is NP-hard (it reduces to subset-sum), so splitfree
uses the standard **greedy net-balance heuristic**: net each person's balance per currency, then
repeatedly match the largest creditor with the largest debtor for `min(|credit|, |debt|)`. It always
settles everyone to zero in **at most n − 1** payments for n people.

All money is stored as integer cents, and splits use the largest-remainder method, so no cent is
ever created or lost. This math lives in `packages/ledger`, which has no dependencies and 100% test
coverage.

## Development

Requires Node 26 and pnpm 12.

```bash
pnpm install
cp .env.example apps/web/.env              # optional; the defaults work for development
pnpm --filter web dev                      # http://localhost:3000
pnpm test                                  # unit tests (node:test) with coverage
pnpm typecheck                             # all workspaces
pnpm --filter web exec playwright test     # end-to-end tests
```

Without `SMTP_HOST`, sign-in codes are printed to the server console, so you can develop without an
email provider. See [CONTRIBUTING.md](CONTRIBUTING.md) for the project's rules.

### Stack

splitfree prefers Node and web built-ins over libraries wherever a solid one exists (see
[CLAUDE.md](CLAUDE.md)):

- **React Router v8** (framework mode, server rendering), **Tailwind v4** and **shadcn/ui**
- **`node:sqlite`** with plain SQL and a small migration runner, no ORM
- **`node:test`** for unit tests, **Playwright** for end-to-end tests
- **`node:crypto`** for IDs, code hashing and session tokens
- **Nodemailer** for SMTP email, **SimpleWebAuthn** for passkeys
- A pnpm monorepo: `packages/ledger` (the money math) and `apps/web` (the app)

```
packages/ledger     money math: split, balances, settle-up plan
apps/web            the React Router app
  app/lib/db        SQLite client, migrations, queries
  app/lib/auth      sessions, email codes, passkeys, bot check, email limits
  app/lib/email     SMTP sending
  app/routes        pages and actions
```

## Contributing

Issues and pull requests are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md). Please report security
issues privately as described in [SECURITY.md](SECURITY.md), not in a public issue.

## License

[MIT](LICENSE) © Florian Dreschner
