# Contributing to splitfree

Thanks for your interest! splitfree is a small, free, open-source bill-splitting app you can host yourself,
maintained by one person in their spare time. Bug reports, fixes and well-scoped improvements are
all welcome. Replies can take a few days.

Found a security issue? Please follow [SECURITY.md](SECURITY.md) instead of opening an issue.

## Before you start

- **Bugs:** open an issue with steps to reproduce, what you expected, and what happened (browser,
  and the commit you run if you self-host).
- **Small fixes** (typos, obvious bugs, docs): go straight to a pull request.
- **Features or larger changes:** open an issue first so we can agree on the approach before you
  spend time on it. splitfree deliberately stays small: core features stay free, and it keeps
  running as one Docker container with SQLite. Not every good idea fits, and that's fine.

## Development setup

Requires Node 26 (see `.node-version`) and pnpm 12.

```bash
pnpm install
pnpm --filter web dev                    # http://localhost:3000
pnpm test                                # unit tests (node:test) with coverage
pnpm typecheck                           # all workspaces
pnpm --filter web exec playwright test   # E2E
```

Copy [.env.example](.env.example) to `apps/web/.env`. Without `SMTP_HOST`, sign-in codes print to
the server console, so you don't need an email provider to develop.

## Project rules

These are the rules reviewers check first. [CLAUDE.md](CLAUDE.md) explains each in more depth.

- **Platform over library.** Prefer Node and web built-ins (`node:test`, `node:sqlite`,
  `node:crypto`, `Intl`, `fetch`). A new runtime dependency needs a clear reason, recorded in
  CLAUDE.md.
- **Money is integer cents.** Never use floats for money. Splitting happens only in
  `packages/ledger/src/split.ts` (largest-remainder method). Balances are per currency, with no FX
  conversion.
- **Only transactions are stored.** Bills, their participants, and payments are the only financial
  facts in the DB; balances and settle-up plans are always derived.
- **`packages/ledger` stays pure:** zero dependencies, erasable TypeScript only (no `enum`,
  `namespace` or parameter properties), and full test coverage.
- **`.server.ts` suffix** for anything touching the DB, secrets or Node-only APIs, so it never
  reaches the browser bundle.
- **Migrations:** add a new numbered file in `apps/web/app/lib/db/migrations/`. Never edit one that
  has already been released; existing databases have run it.
- **Outbound email** must go through the limits in `apps/web/app/lib/auth/otp-limits.server.ts`.

## Pull requests

- Keep each PR focused on one change; split unrelated changes.
- Add or update tests: unit tests for logic, a Playwright test for user-facing flows.
- Make sure `pnpm test` and `pnpm typecheck` pass (and the E2E suite, if you touched the UI).
- Update the README or CLAUDE.md when behavior or setup changes.
- In the description, say what changed and why, and link the issue. Add screenshots for UI changes.
- AI-assisted contributions are fine, as long as you have read, understood and tested what you
  submit.

## Be kind

Be respectful and assume good intent, in issues, reviews and everywhere else. Harassment or
abusive behavior gets you blocked from the project.

## License

splitfree is [MIT licensed](LICENSE). By contributing, you agree that your contribution is licensed
under the same MIT license, and you confirm that you have the right to submit it. There is no CLA.
