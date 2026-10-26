-- Groups: a named, shared list of emails that can be added to a bill in one step. A group is only a
-- template — picking it on a bill expands it into ordinary participants, so bills never reference a
-- group and editing/deleting one never rewrites history. Named split_groups because GROUPS is an
-- SQLite keyword (window frames).

CREATE TABLE split_groups (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  created_by_contact_id TEXT NOT NULL REFERENCES contacts(id),
  created_at            INTEGER NOT NULL,
  -- Join link capability. NULL = link turned off. Valid until join_token_expires_at (epoch seconds).
  join_token            TEXT UNIQUE,
  join_token_expires_at INTEGER
);

-- Membership is keyed by normalized (lowercased) EMAIL, not contact id: saving a group must not create
-- contacts, so the bill flow still sends invites and applies the new-people rate limit at bill time.
-- The creator always has a row here.
CREATE TABLE split_group_members (
  group_id            TEXT NOT NULL REFERENCES split_groups(id) ON DELETE CASCADE,
  email               TEXT NOT NULL,
  added_by_contact_id TEXT NOT NULL REFERENCES contacts(id),
  added_at            INTEGER NOT NULL,
  PRIMARY KEY (group_id, email)
);

CREATE INDEX idx_split_group_members_email ON split_group_members(email);
CREATE INDEX idx_split_groups_creator      ON split_groups(created_by_contact_id);
