-- split.free initial schema.
-- Money is INTEGER minor units (cents). Timestamps are INTEGER unix epoch SECONDS.
-- IDs are TEXT (crypto.randomUUID()). A "person" is a contact (by email); a user is the
-- login identity linked 1:1 to a contact. Transactions (bills + payments) are the source of
-- truth; balances are always derived, never stored.

-- The universal person identity. Every financial row references a contact, never a user.
CREATE TABLE contacts (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,          -- always stored lowercased
  display_name  TEXT,
  created_at    INTEGER NOT NULL
);

-- Auth identity. One-to-one with a contact; created lazily when an email first logs in.
CREATE TABLE users (
  id                TEXT PRIMARY KEY,
  contact_id        TEXT NOT NULL UNIQUE REFERENCES contacts(id) ON DELETE CASCADE,
  email_verified_at INTEGER,
  created_at        INTEGER NOT NULL
);

CREATE TABLE bills (
  id                    TEXT PRIMARY KEY,
  title                 TEXT NOT NULL,
  currency              TEXT NOT NULL,          -- ISO 4217, e.g. 'EUR'
  amount_cents          INTEGER NOT NULL,
  date                  INTEGER NOT NULL,       -- the bill date (user-chosen)
  created_by_contact_id TEXT NOT NULL REFERENCES contacts(id),
  created_at            INTEGER NOT NULL
);

-- One row per person involved in a bill, carrying both sides of their involvement.
-- Stores the RESOLVED owed cents (split mode is resolved before persistence).
-- Write path enforces: SUM(paid_cents) = SUM(owed_cents) = bills.amount_cents.
CREATE TABLE bill_participants (
  id          TEXT PRIMARY KEY,
  bill_id     TEXT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  contact_id  TEXT NOT NULL REFERENCES contacts(id),
  paid_cents  INTEGER NOT NULL DEFAULT 0,
  owed_cents  INTEGER NOT NULL DEFAULT 0,
  UNIQUE (bill_id, contact_id)
);

-- Settle-up: a directed transfer from one contact to another.
CREATE TABLE payments (
  id                    TEXT PRIMARY KEY,
  from_contact_id       TEXT NOT NULL REFERENCES contacts(id),
  to_contact_id         TEXT NOT NULL REFERENCES contacts(id),
  currency              TEXT NOT NULL,
  amount_cents          INTEGER NOT NULL,
  date                  INTEGER NOT NULL,
  note                  TEXT,
  created_by_contact_id TEXT NOT NULL REFERENCES contacts(id),
  created_at            INTEGER NOT NULL
);

-- Short-lived email OTP login codes. Only the SHA-256 hash is stored, never the plaintext.
CREATE TABLE otp_codes (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL,                    -- lowercased
  code_hash   TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,
  consumed_at INTEGER,
  attempts    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);

-- WebAuthn / passkey credentials.
CREATE TABLE passkey_credentials (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,           -- base64url
  public_key    BLOB NOT NULL,
  counter       INTEGER NOT NULL DEFAULT 0,
  transports    TEXT,                           -- JSON array
  device_label  TEXT,
  created_at    INTEGER NOT NULL,
  last_used_at  INTEGER
);

-- Pending WebAuthn challenges (single-use, short TTL).
CREATE TABLE webauthn_challenges (
  id         TEXT PRIMARY KEY,
  challenge  TEXT NOT NULL,
  type       TEXT NOT NULL,                     -- 'register' | 'login'
  email      TEXT,
  user_id    TEXT REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

-- Server-side session registry so logout/revocation is real. JWT carries the session id.
CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE INDEX idx_bill_participants_contact ON bill_participants(contact_id);
CREATE INDEX idx_bill_participants_bill     ON bill_participants(bill_id);
CREATE INDEX idx_payments_from              ON payments(from_contact_id);
CREATE INDEX idx_payments_to                ON payments(to_contact_id);
CREATE INDEX idx_otp_codes_email            ON otp_codes(email);
CREATE INDEX idx_sessions_user              ON sessions(user_id);
CREATE INDEX idx_passkey_user               ON passkey_credentials(user_id);
