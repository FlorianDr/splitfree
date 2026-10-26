-- Security audit trail (OWASP A09). Append-only record of auth events and financial mutations so
-- abuse leaves a tamper-evident trail. Never read on the request hot path; queried for ops/forensics
-- and to rate-limit new-participant creation (see countRecentParticipantAdds).

CREATE TABLE audit_log (
  id                TEXT PRIMARY KEY,
  ts                INTEGER NOT NULL,   -- unix epoch seconds
  event             TEXT NOT NULL,      -- e.g. 'login.otp', 'bill.create', 'participant.add'
  actor_contact_id  TEXT,               -- who acted (NULL for pre-auth events like a failed login)
  subject_id        TEXT,               -- affected object id (bill / payment / session), if any
  detail            TEXT,               -- optional JSON blob of extra context
  ip                TEXT                -- client IP (from the reverse proxy), if known
);

CREATE INDEX idx_audit_ts            ON audit_log(ts);
CREATE INDEX idx_audit_actor_event   ON audit_log(actor_contact_id, event, ts);
