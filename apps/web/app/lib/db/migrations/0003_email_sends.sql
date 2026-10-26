-- Outbound email ledger for abuse limits and the shared email-provider budget (otp-limits.server.ts).
-- One row per email we commit to send: 'otp' (login code), 'invite' (new participant), 'alert' (ops).
-- A row is written before the send and deleted again if the provider rejects it, so the ledger tracks
-- what actually counts against the provider's quota. Rows older than two days are pruned on insert.
CREATE TABLE email_sends (
  id               TEXT PRIMARY KEY,
  kind             TEXT NOT NULL,          -- 'otp' | 'invite' | 'alert'
  ip_bucket        TEXT,                   -- visitor's IPv4 address or IPv6 /64; NULL when unknown
  ip_wide          TEXT,                   -- visitor's IPv4 /24 or IPv6 /48; NULL when unknown
  actor_contact_id TEXT,                   -- the inviter, for 'invite'
  tag              TEXT,                   -- the alert key, for 'alert' (one email per key per UTC day)
  created_at       INTEGER NOT NULL        -- unix epoch seconds
);

CREATE INDEX idx_email_sends_created ON email_sends(created_at);

-- otp_codes is pruned by age too (codes expire after 10 minutes; the rows only feed the per-email limit).
CREATE INDEX idx_otp_codes_created ON otp_codes(created_at);
