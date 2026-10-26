# Security policy

splitfree handles sign-in (email codes, passkeys, session cookies) and people's shared-expense data,
so security reports are very welcome. It is a small project run by one maintainer in their spare
time; the process below is best effort, but every report gets read.

## Supported versions

There are no versioned releases. Only the latest `main` is supported, and fixes land there. If you
self-host, update to the latest `main` to get them.

## Reporting a vulnerability

**Please don't open a public issue, pull request or discussion for a vulnerability.**

1. **Preferred:** report it privately through GitHub:
   [Security → Report a vulnerability](https://github.com/FlorianDr/splitfree/security/advisories/new).
2. **Or by email:** code@dreschner.eu, with "splitfree security" in the subject.

Helpful details:

- What is affected (route, file, or feature) and the commit you tested.
- Steps to reproduce or a proof of concept, against a local instance.
- The impact you see: whose data or account is at risk, and what an attacker needs.
- Whether you would like to be credited, and under which name.

## What to expect

- An acknowledgement within **7 days**.
- An initial assessment (accepted or not, severity, rough plan) within **30 days**.
- A fix on `main`, then a published GitHub security advisory that credits you unless you prefer
  otherwise. A CVE is requested for issues that affect self-hosters.
- We aim to disclose within **90 days** of your report, sooner once a fix is out. If a fix needs
  longer, we'll tell you why and agree on a date with you.

## Scope

In scope: the code in this repository, for example

- account takeover or sign-in bypass (email codes, passkeys, sessions/JWT),
- seeing or changing another user's bills, payments, contacts or groups,
- money math that creates or loses cents, or a settle-up plan that doesn't settle to zero,
- getting the app to send email beyond its limits (to arbitrary addresses, or past the
  per-address / per-IP / daily caps),
- leaking secrets, or anything server-only reaching the browser bundle.

Out of scope:

- denial of service by volume, spam, and social engineering,
- reports from automated scanners, or missing headers, without a demonstrated impact,
- a self-hosted instance that ignores the setup docs (no TLS, a proxy that doesn't overwrite
  `CLIENT_IP_HEADER`, `ALLOW_TEST_LOGIN` set in production, a public backup bucket),
- vulnerabilities in dependencies with no exploitable path in splitfree. Please report those
  upstream; we'll update once a fix is released.

## Testing guidelines

Please test against your own instance (`pnpm --filter web dev`, see the [README](README.md)), not
against the public instance at splitfree.cash or any other one you don't run. In particular, don't
access other people's data, and don't make the app send email to addresses you don't control. We
won't pursue or support legal action against good-faith research that follows this policy.

## For self-hosters

- Keep `.env.production` (secrets) and your Litestream bucket keys private, and the bucket private:
  Litestream backups are not encrypted client-side.
- Your reverse proxy must **overwrite** the header named in `CLIENT_IP_HEADER` with the client IP
  (with Caddy: `header_up X-Real-IP {client_ip}`), or the per-IP email limits can be bypassed.
- Never set `ALLOW_TEST_LOGIN` outside of tests.
- To hear about fixes, watch this repository with *Custom → Security alerts* enabled.
