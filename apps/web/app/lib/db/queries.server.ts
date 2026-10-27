import type { Cents, Currency } from "@splitfree/ledger";
import type { IpBuckets } from "~/lib/client-ip.server";
import { type InviteCounts, type OtpCounts, utcDayStart } from "~/lib/auth/otp-limits.server";
import { randomBytes } from "node:crypto";
import { JOIN_LINK_TTL_SECONDS } from "~/lib/limits";
import { getDb, newId, now, tx } from "./client.server";

// ---------------------------------------------------------------------------
// Row shapes (snake_case columns mapped to camelCase where returned to callers)
// ---------------------------------------------------------------------------

export interface Contact {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: number;
}

export interface User {
  id: string;
  contactId: string;
  emailVerifiedAt: number | null;
  createdAt: number;
}

export interface BillWithParticipants {
  id: string;
  title: string;
  currency: string;
  amountCents: number;
  date: number;
  createdByContactId: string;
  createdAt: number;
  participants: { contactId: string; paidCents: number; owedCents: number }[];
}

export interface Payment {
  id: string;
  fromContactId: string;
  toContactId: string;
  currency: string;
  amountCents: number;
  date: number;
  note: string | null;
  createdByContactId: string;
  createdAt: number;
}

export interface PasskeyCredential {
  id: string;
  userId: string;
  credentialId: string;
  publicKey: Uint8Array;
  counter: number;
  transports: string | null;
  deviceLabel: string | null;
  createdAt: number;
  lastUsedAt: number | null;
}

const normalizeEmail = (email: string): string => email.trim().toLowerCase();
const displayFromEmail = (email: string): string => email.split("@")[0] ?? email;

// ---------------------------------------------------------------------------
// Contacts & users
// ---------------------------------------------------------------------------

export function getContactById(id: string): Contact | undefined {
  const row = getDb()
    .prepare(
      "SELECT id, email, display_name, created_at FROM contacts WHERE id = ?",
    )
    .get(id) as
    | { id: string; email: string; display_name: string | null; created_at: number }
    | undefined;
  if (!row) return undefined;
  return { id: row.id, email: row.email, displayName: row.display_name, createdAt: row.created_at };
}

export function getContactsByIds(ids: string[]): Map<string, Contact> {
  const result = new Map<string, Contact>();
  for (const id of ids) {
    const c = getContactById(id);
    if (c) result.set(id, c);
  }
  return result;
}

export function findContactByEmail(email: string): Contact | undefined {
  const row = getDb()
    .prepare(
      "SELECT id, email, display_name, created_at FROM contacts WHERE email = ?",
    )
    .get(normalizeEmail(email)) as
    | { id: string; email: string; display_name: string | null; created_at: number }
    | undefined;
  if (!row) return undefined;
  return { id: row.id, email: row.email, displayName: row.display_name, createdAt: row.created_at };
}

/** Find an existing contact by email or create a bare one (no user account yet). */
export function upsertContactByEmail(email: string, displayName?: string): Contact {
  const existing = findContactByEmail(email);
  if (existing) {
    if (displayName && !existing.displayName) {
      getDb()
        .prepare("UPDATE contacts SET display_name = ? WHERE id = ?")
        .run(displayName, existing.id);
      return { ...existing, displayName };
    }
    return existing;
  }
  const normalized = normalizeEmail(email);
  const contact: Contact = {
    id: newId(),
    email: normalized,
    displayName: displayName ?? displayFromEmail(normalized),
    createdAt: now(),
  };
  getDb()
    .prepare(
      "INSERT INTO contacts (id, email, display_name, created_at) VALUES (?, ?, ?, ?)",
    )
    .run(contact.id, contact.email, contact.displayName, contact.createdAt);
  return contact;
}

export interface PaymentDetails {
  iban: string | null;
  /** A clean link from `parseWeroLink`. */
  weroLink: string | null;
}

export function getPaymentDetails(contactId: string): PaymentDetails {
  const row = getDb().prepare("SELECT iban, wero_link FROM contacts WHERE id = ?").get(contactId) as
    | { iban: string | null; wero_link: string | null }
    | undefined;
  return { iban: row?.iban ?? null, weroLink: row?.wero_link ?? null };
}

/**
 * Save a person's own display name and payment details together: with an IBAN, the name is the
 * account holder name. Values must already be validated and normalized; null clears them.
 */
export function setContactProfile(
  contactId: string,
  displayName: string | null,
  details: PaymentDetails,
): void {
  getDb()
    .prepare("UPDATE contacts SET display_name = ?, iban = ?, wero_link = ? WHERE id = ?")
    .run(displayName, details.iban, details.weroLink, contactId);
}

export function getUserById(id: string): User | undefined {
  const row = getDb()
    .prepare(
      "SELECT id, contact_id, email_verified_at, created_at FROM users WHERE id = ?",
    )
    .get(id) as
    | { id: string; contact_id: string; email_verified_at: number | null; created_at: number }
    | undefined;
  if (!row) return undefined;
  return {
    id: row.id,
    contactId: row.contact_id,
    emailVerifiedAt: row.email_verified_at,
    createdAt: row.created_at,
  };
}

export function getUserByContactId(contactId: string): User | undefined {
  const row = getDb()
    .prepare(
      "SELECT id, contact_id, email_verified_at, created_at FROM users WHERE contact_id = ?",
    )
    .get(contactId) as
    | { id: string; contact_id: string; email_verified_at: number | null; created_at: number }
    | undefined;
  if (!row) return undefined;
  return {
    id: row.id,
    contactId: row.contact_id,
    emailVerifiedAt: row.email_verified_at,
    createdAt: row.created_at,
  };
}

/**
 * Resolve a verified email login to a user: upsert the contact (upgrading a bare contact in place),
 * create the user if missing, and stamp email_verified_at. Returns the user + contact.
 */
export function findOrCreateVerifiedUser(email: string): { user: User; contact: Contact } {
  return tx(() => {
    const contact = upsertContactByEmail(email);
    let user = getUserByContactId(contact.id);
    const ts = now();
    if (!user) {
      const id = newId();
      getDb()
        .prepare(
          "INSERT INTO users (id, contact_id, email_verified_at, created_at) VALUES (?, ?, ?, ?)",
        )
        .run(id, contact.id, ts, ts);
      user = { id, contactId: contact.id, emailVerifiedAt: ts, createdAt: ts };
    } else if (user.emailVerifiedAt == null) {
      getDb().prepare("UPDATE users SET email_verified_at = ? WHERE id = ?").run(ts, user.id);
      user = { ...user, emailVerifiedAt: ts };
    }
    return { user, contact };
  });
}

// ---------------------------------------------------------------------------
// Bills
// ---------------------------------------------------------------------------

export interface CreateBillInput {
  title: string;
  currency: string;
  amountCents: number;
  date: number;
  createdByContactId: string;
  participants: { contactId: string; paidCents: number; owedCents: number }[];
}

export function createBill(input: CreateBillInput): string {
  const billId = newId();
  tx((db) => {
    db.prepare(
      `INSERT INTO bills (id, title, currency, amount_cents, date, created_by_contact_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      billId,
      input.title,
      input.currency,
      input.amountCents,
      input.date,
      input.createdByContactId,
      now(),
    );
    const insertP = db.prepare(
      `INSERT INTO bill_participants (id, bill_id, contact_id, paid_cents, owed_cents)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const p of input.participants) {
      insertP.run(newId(), billId, p.contactId, p.paidCents, p.owedCents);
    }
  });
  return billId;
}

export function deleteBill(billId: string): void {
  getDb().prepare("DELETE FROM bills WHERE id = ?").run(billId);
}

function groupBills(
  rows: {
    bill_id: string;
    title: string;
    currency: string;
    amount_cents: number;
    date: number;
    created_by_contact_id: string;
    created_at: number;
    contact_id: string;
    paid_cents: number;
    owed_cents: number;
  }[],
): BillWithParticipants[] {
  const byId = new Map<string, BillWithParticipants>();
  for (const r of rows) {
    let bill = byId.get(r.bill_id);
    if (!bill) {
      bill = {
        id: r.bill_id,
        title: r.title,
        currency: r.currency,
        amountCents: r.amount_cents,
        date: r.date,
        createdByContactId: r.created_by_contact_id,
        createdAt: r.created_at,
        participants: [],
      };
      byId.set(r.bill_id, bill);
    }
    bill.participants.push({
      contactId: r.contact_id,
      paidCents: r.paid_cents,
      owedCents: r.owed_cents,
    });
  }
  return [...byId.values()];
}

export function getBillWithParticipants(billId: string): BillWithParticipants | undefined {
  const rows = getDb()
    .prepare(
      `SELECT b.id AS bill_id, b.title, b.currency, b.amount_cents, b.date,
              b.created_by_contact_id, b.created_at,
              bp.contact_id, bp.paid_cents, bp.owed_cents
       FROM bills b JOIN bill_participants bp ON bp.bill_id = b.id
       WHERE b.id = ?`,
    )
    .all(billId) as Parameters<typeof groupBills>[0];
  const grouped = groupBills(rows);
  return grouped[0];
}

/** All bills the contact participates in, newest first, each with its full participant list. */
export function listBillsForContact(contactId: string): BillWithParticipants[] {
  const rows = getDb()
    .prepare(
      `SELECT b.id AS bill_id, b.title, b.currency, b.amount_cents, b.date,
              b.created_by_contact_id, b.created_at,
              bp.contact_id, bp.paid_cents, bp.owed_cents
       FROM bills b JOIN bill_participants bp ON bp.bill_id = b.id
       WHERE b.id IN (SELECT bill_id FROM bill_participants WHERE contact_id = ?)
       ORDER BY b.date DESC, b.created_at DESC`,
    )
    .all(contactId) as Parameters<typeof groupBills>[0];
  return groupBills(rows);
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export interface CreatePaymentInput {
  fromContactId: string;
  toContactId: string;
  currency: string;
  amountCents: number;
  date: number;
  note?: string | null;
  createdByContactId: string;
}

export function createPayment(input: CreatePaymentInput): string {
  const id = newId();
  getDb()
    .prepare(
      `INSERT INTO payments
         (id, from_contact_id, to_contact_id, currency, amount_cents, date, note, created_by_contact_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.fromContactId,
      input.toContactId,
      input.currency,
      input.amountCents,
      input.date,
      input.note ?? null,
      input.createdByContactId,
      now(),
    );
  return id;
}

export function listPaymentsForContact(contactId: string): Payment[] {
  const rows = getDb()
    .prepare(
      `SELECT id, from_contact_id, to_contact_id, currency, amount_cents, date, note,
              created_by_contact_id, created_at
       FROM payments
       WHERE from_contact_id = ? OR to_contact_id = ?
       ORDER BY date DESC, created_at DESC`,
    )
    .all(contactId, contactId) as {
    id: string;
    from_contact_id: string;
    to_contact_id: string;
    currency: string;
    amount_cents: number;
    date: number;
    note: string | null;
    created_by_contact_id: string;
    created_at: number;
  }[];
  return rows.map((r) => ({
    id: r.id,
    fromContactId: r.from_contact_id,
    toContactId: r.to_contact_id,
    currency: r.currency,
    amountCents: r.amount_cents,
    date: r.date,
    note: r.note,
    createdByContactId: r.created_by_contact_id,
    createdAt: r.created_at,
  }));
}

/**
 * Everyone linked to `contactId` through bills and payments, transitively (the contact included),
 * sorted by id. A settle-up plan is only correct over a whole circle: a person's net balance includes
 * bills the viewer is not on, so planning over the viewer's own bills tells net creditors to pay.
 */
export function listSettleCircle(contactId: string): string[] {
  const rows = getDb()
    .prepare(
      `WITH RECURSIVE circle(id) AS (
         SELECT ?
         UNION
         SELECT other.contact_id
           FROM circle
           JOIN bill_participants mine  ON mine.contact_id = circle.id
           JOIN bill_participants other ON other.bill_id = mine.bill_id
         UNION
         SELECT p.to_contact_id FROM circle JOIN payments p ON p.from_contact_id = circle.id
         UNION
         SELECT p.from_contact_id FROM circle JOIN payments p ON p.to_contact_id = circle.id
       )
       SELECT id FROM circle ORDER BY id`,
    )
    .all(contactId) as { id: string }[];
  return rows.map((r) => r.id);
}

/**
 * Net balance per currency of each of `contactIds`: paid − owed on bills, plus payments made − received.
 * Zero balances are left out. Same result as the ledger's `computeNetBalances`, as a SQL aggregate.
 */
export function getNetBalances(contactIds: string[]): Map<Currency, Map<string, Cents>> {
  const ids = JSON.stringify(contactIds);
  const rows = getDb()
    .prepare(
      `SELECT contact_id, currency, SUM(delta) AS net FROM (
         SELECT bp.contact_id, b.currency, bp.paid_cents - bp.owed_cents AS delta
           FROM bill_participants bp JOIN bills b ON b.id = bp.bill_id
          WHERE bp.contact_id IN (SELECT value FROM json_each(?))
         UNION ALL
         SELECT from_contact_id, currency, amount_cents FROM payments
          WHERE from_contact_id IN (SELECT value FROM json_each(?))
         UNION ALL
         SELECT to_contact_id, currency, -amount_cents FROM payments
          WHERE to_contact_id IN (SELECT value FROM json_each(?))
       )
       GROUP BY contact_id, currency
       HAVING net <> 0
       ORDER BY currency, contact_id`,
    )
    .all(ids, ids, ids) as { contact_id: string; currency: string; net: number }[];
  const net = new Map<Currency, Map<string, Cents>>();
  for (const r of rows) {
    let inner = net.get(r.currency);
    if (inner === undefined) net.set(r.currency, (inner = new Map()));
    inner.set(r.contact_id, r.net);
  }
  return net;
}

// ---------------------------------------------------------------------------
// OTP codes
// ---------------------------------------------------------------------------

export function insertOtp(email: string, codeHash: string, expiresAt: number): void {
  getDb()
    .prepare(
      "INSERT INTO otp_codes (id, email, code_hash, expires_at, attempts, created_at) VALUES (?, ?, ?, ?, 0, ?)",
    )
    .run(newId(), normalizeEmail(email), codeHash, expiresAt, now());
}

export interface OtpRow {
  id: string;
  email: string;
  codeHash: string;
  expiresAt: number;
  consumedAt: number | null;
  attempts: number;
}

export function latestActiveOtp(email: string): OtpRow | undefined {
  const row = getDb()
    .prepare(
      `SELECT id, email, code_hash, expires_at, consumed_at, attempts
       FROM otp_codes
       WHERE email = ? AND consumed_at IS NULL AND expires_at > ?
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(normalizeEmail(email), now()) as
    | {
        id: string;
        email: string;
        code_hash: string;
        expires_at: number;
        consumed_at: number | null;
        attempts: number;
      }
    | undefined;
  if (!row) return undefined;
  return {
    id: row.id,
    email: row.email,
    codeHash: row.code_hash,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
    attempts: row.attempts,
  };
}

export function incrementOtpAttempts(id: string): void {
  getDb().prepare("UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?").run(id);
}

export function consumeOtp(id: string): void {
  getDb().prepare("UPDATE otp_codes SET consumed_at = ? WHERE id = ?").run(now(), id);
}

// ---------------------------------------------------------------------------
// Outbound email ledger (abuse limits + the shared provider budget, see otp-limits.server.ts)
// ---------------------------------------------------------------------------

export type EmailKind = "otp" | "invite" | "alert";

const DAY = 86_400;
/** Ledger rows and spent OTP rows are only needed for the 24 h limits. */
const SEND_RETENTION_SECONDS = 2 * DAY;
/** Matches the privacy policy's security-log retention. */
const AUDIT_RETENTION_SECONDS = 90 * DAY;

/** Counts behind every OTP limit, taken in one pass over the last 24 h of the ledger. */
export function otpRequestCounts(email: string, ip: IpBuckets | null): OtpCounts {
  const t = now();
  const db = getDb();
  const sends = db
    .prepare(
      `SELECT
         COALESCE(SUM(kind = 'otp' AND ip_bucket = ? AND created_at > ?), 0) AS ipHour,
         COALESCE(SUM(kind = 'otp' AND ip_bucket = ?), 0)                    AS ipDay,
         COALESCE(SUM(kind = 'otp' AND ip_wide = ?), 0)                      AS ipWideDay,
         COALESCE(SUM(kind = 'otp' AND created_at > ?), 0)                   AS globalHour,
         COALESCE(SUM(kind IN ('otp', 'invite') AND created_at >= ?), 0)     AS budgetDay
       FROM email_sends WHERE created_at > ?`,
    )
    .get(
      ip?.narrow ?? null,
      t - 3600,
      ip?.narrow ?? null,
      ip?.wide ?? null,
      t - 3600,
      utcDayStart(t),
      t - DAY,
    ) as Omit<OtpCounts, "email">;
  const perEmail = db
    .prepare("SELECT COUNT(*) AS n FROM otp_codes WHERE email = ? AND created_at > ?")
    .get(normalizeEmail(email), t - 3600) as { n: number };
  return { ...sends, email: perEmail.n };
}

/** Counts behind the invite limits, since 00:00 UTC. */
export function inviteCounts(actorContactId: string): InviteCounts {
  return getDb()
    .prepare(
      `SELECT
         COALESCE(SUM(kind = 'invite' AND actor_contact_id = ?), 0) AS actorDay,
         COALESCE(SUM(kind = 'invite'), 0)                          AS inviteDay,
         COALESCE(SUM(kind IN ('otp', 'invite')), 0)                AS budgetDay
       FROM email_sends WHERE created_at >= ?`,
    )
    .get(actorContactId, utcDayStart(now())) as Pick<InviteCounts, keyof InviteCounts>;
}

/** Whether an alert email with this key already went out today (survives restarts). */
export function alertSentToday(tag: string): boolean {
  return (
    getDb()
      .prepare("SELECT 1 FROM email_sends WHERE kind = 'alert' AND tag = ? AND created_at >= ?")
      .get(tag, utcDayStart(now())) !== undefined
  );
}

/**
 * Reserve one outbound email in the ledger (call synchronously right after the limit check, before
 * any await, so concurrent requests can't both pass the same count). Also prunes expired security
 * data: ledger and OTP rows after two days, audit rows after 90 days.
 */
export function recordEmailSend(
  kind: EmailKind,
  opts: { ip?: IpBuckets | null; actorContactId?: string | null; tag?: string | null } = {},
): string {
  const id = newId();
  const t = now();
  const db = getDb();
  db.prepare(
    `INSERT INTO email_sends (id, kind, ip_bucket, ip_wide, actor_contact_id, tag, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, kind, opts.ip?.narrow ?? null, opts.ip?.wide ?? null, opts.actorContactId ?? null, opts.tag ?? null, t);
  db.prepare("DELETE FROM email_sends WHERE created_at < ?").run(t - SEND_RETENTION_SECONDS);
  db.prepare("DELETE FROM otp_codes WHERE created_at < ?").run(t - SEND_RETENTION_SECONDS);
  db.prepare("DELETE FROM audit_log WHERE ts < ?").run(t - AUDIT_RETENTION_SECONDS);
  return id;
}

/** Release a reservation whose email the provider did not accept, so it doesn't count against the quota. */
export function deleteEmailSend(id: string): void {
  getDb().prepare("DELETE FROM email_sends WHERE id = ?").run(id);
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export function createSession(userId: string, expiresAt: number): string {
  const id = newId();
  getDb()
    .prepare(
      "INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
    )
    .run(id, userId, now(), expiresAt);
  return id;
}

export function isSessionActive(sessionId: string): boolean {
  const row = getDb()
    .prepare(
      "SELECT id FROM sessions WHERE id = ? AND revoked_at IS NULL AND expires_at > ?",
    )
    .get(sessionId, now()) as { id: string } | undefined;
  return Boolean(row);
}

export function revokeSession(sessionId: string): void {
  getDb().prepare("UPDATE sessions SET revoked_at = ? WHERE id = ?").run(now(), sessionId);
}

// ---------------------------------------------------------------------------
// WebAuthn: challenges + credentials
// ---------------------------------------------------------------------------

export function insertChallenge(input: {
  challenge: string;
  type: "register" | "login";
  email?: string | null;
  userId?: string | null;
  ttlSeconds?: number;
}): string {
  const id = newId();
  getDb()
    .prepare(
      "INSERT INTO webauthn_challenges (id, challenge, type, email, user_id, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(
      id,
      input.challenge,
      input.type,
      input.email ?? null,
      input.userId ?? null,
      now() + (input.ttlSeconds ?? 300),
    );
  return id;
}

export function takeChallenge(
  id: string,
): { challenge: string; type: string; email: string | null; userId: string | null } | undefined {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT challenge, type, email, user_id, expires_at FROM webauthn_challenges WHERE id = ?",
    )
    .get(id) as
    | { challenge: string; type: string; email: string | null; user_id: string | null; expires_at: number }
    | undefined;
  db.prepare("DELETE FROM webauthn_challenges WHERE id = ?").run(id);
  if (!row || row.expires_at <= now()) return undefined;
  return { challenge: row.challenge, type: row.type, email: row.email, userId: row.user_id };
}

export function insertCredential(input: {
  userId: string;
  credentialId: string;
  publicKey: Uint8Array;
  counter: number;
  transports?: string[] | null;
  deviceLabel?: string | null;
}): void {
  getDb()
    .prepare(
      `INSERT INTO passkey_credentials
         (id, user_id, credential_id, public_key, counter, transports, device_label, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      newId(),
      input.userId,
      input.credentialId,
      input.publicKey,
      input.counter,
      input.transports ? JSON.stringify(input.transports) : null,
      input.deviceLabel ?? null,
      now(),
    );
}

function mapCredential(row: {
  id: string;
  user_id: string;
  credential_id: string;
  public_key: Uint8Array;
  counter: number;
  transports: string | null;
  device_label: string | null;
  created_at: number;
  last_used_at: number | null;
}): PasskeyCredential {
  return {
    id: row.id,
    userId: row.user_id,
    credentialId: row.credential_id,
    publicKey: row.public_key,
    counter: row.counter,
    transports: row.transports,
    deviceLabel: row.device_label,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  };
}

export function listCredentialsByUser(userId: string): PasskeyCredential[] {
  const rows = getDb()
    .prepare("SELECT * FROM passkey_credentials WHERE user_id = ?")
    .all(userId) as Parameters<typeof mapCredential>[0][];
  return rows.map(mapCredential);
}

export function listCredentialsByEmail(email: string): PasskeyCredential[] {
  const rows = getDb()
    .prepare(
      `SELECT pc.* FROM passkey_credentials pc
       JOIN users u ON u.id = pc.user_id
       JOIN contacts c ON c.id = u.contact_id
       WHERE c.email = ?`,
    )
    .all(normalizeEmail(email)) as Parameters<typeof mapCredential>[0][];
  return rows.map(mapCredential);
}

export function getCredentialByCredentialId(credentialId: string): PasskeyCredential | undefined {
  const row = getDb()
    .prepare("SELECT * FROM passkey_credentials WHERE credential_id = ?")
    .get(credentialId) as Parameters<typeof mapCredential>[0] | undefined;
  return row ? mapCredential(row) : undefined;
}

export function updateCredentialCounter(credentialId: string, counter: number): void {
  getDb()
    .prepare(
      "UPDATE passkey_credentials SET counter = ?, last_used_at = ? WHERE credential_id = ?",
    )
    .run(counter, now(), credentialId);
}

// ---------------------------------------------------------------------------
// Audit log (security trail; see audit.server.ts for the typed wrapper)
// ---------------------------------------------------------------------------

export interface AuditRow {
  id: string;
  ts: number;
  event: string;
  actorContactId: string | null;
  subjectId: string | null;
  detail: string | null;
  ip: string | null;
}

export function recordAuditRow(input: {
  event: string;
  actorContactId?: string | null;
  subjectId?: string | null;
  detail?: Record<string, unknown> | null;
  ip?: string | null;
}): void {
  getDb()
    .prepare(
      `INSERT INTO audit_log (id, ts, event, actor_contact_id, subject_id, detail, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      newId(),
      now(),
      input.event,
      input.actorContactId ?? null,
      input.subjectId ?? null,
      input.detail ? JSON.stringify(input.detail) : null,
      input.ip ?? null,
    );
}

export function listRecentAudit(limit = 100): AuditRow[] {
  const rows = getDb()
    .prepare(
      `SELECT id, ts, event, actor_contact_id, subject_id, detail, ip
       FROM audit_log ORDER BY ts DESC, rowid DESC LIMIT ?`,
    )
    .all(limit) as {
    id: string;
    ts: number;
    event: string;
    actor_contact_id: string | null;
    subject_id: string | null;
    detail: string | null;
    ip: string | null;
  }[];
  return rows.map((r) => ({
    id: r.id,
    ts: r.ts,
    event: r.event,
    actorContactId: r.actor_contact_id,
    subjectId: r.subject_id,
    detail: r.detail,
    ip: r.ip,
  }));
}

/** Count `participant.add` audit events by this actor within the window — backs the A04 rate limit. */
export function countRecentParticipantAdds(actorContactId: string, sinceSeconds: number): number {
  return countRecentAuditEvents(actorContactId, "participant.add", sinceSeconds);
}

/** Count `event` audit rows by this actor within the window — backs the per-actor rate limits. */
export function countRecentAuditEvents(actorContactId: string, event: string, sinceSeconds: number): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM audit_log
       WHERE event = ? AND actor_contact_id = ? AND ts > ?`,
    )
    .get(event, actorContactId, now() - sinceSeconds) as { n: number };
  return row.n;
}

// ---------------------------------------------------------------------------
// Groups (a shared, named list of emails; see migrations/0004_groups.sql)
// ---------------------------------------------------------------------------

export interface GroupMember {
  email: string;
  addedByContactId: string;
  addedAt: number;
}

export interface GroupWithMembers {
  id: string;
  name: string;
  createdByContactId: string;
  createdAt: number;
  /** NULL when the join link is turned off. */
  joinToken: string | null;
  joinTokenExpiresAt: number | null;
  members: GroupMember[];
}

type GroupRow = {
  id: string;
  name: string;
  created_by_contact_id: string;
  created_at: number;
  join_token: string | null;
  join_token_expires_at: number | null;
};

const GROUP_COLUMNS = "id, name, created_by_contact_id, created_at, join_token, join_token_expires_at";

/** 32 random bytes, base64url — an unguessable join-link capability. */
const newJoinToken = (): string => randomBytes(32).toString("base64url");

function withMembers(rows: GroupRow[]): GroupWithMembers[] {
  const select = getDb().prepare(
    `SELECT email, added_by_contact_id, added_at FROM split_group_members
     WHERE group_id = ? ORDER BY added_at, email`,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    createdByContactId: r.created_by_contact_id,
    createdAt: r.created_at,
    joinToken: r.join_token,
    joinTokenExpiresAt: r.join_token_expires_at,
    members: (select.all(r.id) as { email: string; added_by_contact_id: string; added_at: number }[]).map(
      (m) => ({ email: m.email, addedByContactId: m.added_by_contact_id, addedAt: m.added_at }),
    ),
  }));
}

/**
 * Create a group with its creator as the first member plus `memberEmails`, and a fresh join link.
 * Emails are stored normalized; duplicates are ignored. Callers validate names/emails/limits first.
 */
export function createGroup(input: {
  name: string;
  creatorContactId: string;
  creatorEmail: string;
  memberEmails: string[];
}): string {
  const groupId = newId();
  const t = now();
  tx((db) => {
    db.prepare(
      `INSERT INTO split_groups (${GROUP_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(groupId, input.name, input.creatorContactId, t, newJoinToken(), t + JOIN_LINK_TTL_SECONDS);
    const insert = db.prepare(
      `INSERT OR IGNORE INTO split_group_members (group_id, email, added_by_contact_id, added_at)
       VALUES (?, ?, ?, ?)`,
    );
    for (const email of [input.creatorEmail, ...input.memberEmails]) {
      insert.run(groupId, normalizeEmail(email), input.creatorContactId, t);
    }
  });
  return groupId;
}

export function getGroupWithMembers(groupId: string): GroupWithMembers | undefined {
  const row = getDb()
    .prepare(`SELECT ${GROUP_COLUMNS} FROM split_groups WHERE id = ?`)
    .get(groupId) as GroupRow | undefined;
  return row ? withMembers([row])[0] : undefined;
}

/** Every group `email` is a member of, by name. Groups never appear to non-members. */
export function listGroupsForEmail(email: string): GroupWithMembers[] {
  const rows = getDb()
    .prepare(
      `SELECT ${GROUP_COLUMNS.split(", ").map((c) => `g.${c}`).join(", ")}
       FROM split_groups g JOIN split_group_members m ON m.group_id = g.id
       WHERE m.email = ? ORDER BY g.name COLLATE NOCASE, g.created_at`,
    )
    .all(normalizeEmail(email)) as GroupRow[];
  return withMembers(rows);
}

/**
 * Add `emails` to a group, all or nothing: returns the emails actually added, or "full" when the
 * group would exceed `max` members. Count and insert run in one transaction.
 */
export function addGroupMembers(
  groupId: string,
  emails: string[],
  addedByContactId: string,
  max: number,
): { added: string[] } | "full" {
  return tx((db) => {
    const existing = new Set(
      (db.prepare("SELECT email FROM split_group_members WHERE group_id = ?").all(groupId) as {
        email: string;
      }[]).map((r) => r.email),
    );
    const added = [...new Set(emails.map(normalizeEmail))].filter((e) => !existing.has(e));
    if (existing.size + added.length > max) return "full" as const;
    const insert = db.prepare(
      `INSERT OR IGNORE INTO split_group_members (group_id, email, added_by_contact_id, added_at)
       VALUES (?, ?, ?, ?)`,
    );
    const t = now();
    for (const email of added) insert.run(groupId, email, addedByContactId, t);
    return { added };
  });
}

export function removeGroupMember(groupId: string, email: string): void {
  getDb()
    .prepare("DELETE FROM split_group_members WHERE group_id = ? AND email = ?")
    .run(groupId, normalizeEmail(email));
}

export function renameGroup(groupId: string, name: string): void {
  getDb().prepare("UPDATE split_groups SET name = ? WHERE id = ?").run(name, groupId);
}

/** Deletes the group and (by cascade) its members. Bills never reference groups, so none change. */
export function deleteGroup(groupId: string): void {
  getDb().prepare("DELETE FROM split_groups WHERE id = ?").run(groupId);
}

export function countGroupsCreatedBy(contactId: string): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS n FROM split_groups WHERE created_by_contact_id = ?")
    .get(contactId) as { n: number };
  return row.n;
}

/** The group behind a join link, if the link exists, is turned on and hasn't expired. */
export function getGroupByJoinToken(token: string): GroupWithMembers | undefined {
  const row = getDb()
    .prepare(
      `SELECT ${GROUP_COLUMNS} FROM split_groups
       WHERE join_token = ? AND join_token_expires_at > ?`,
    )
    .get(token, now()) as GroupRow | undefined;
  return row ? withMembers([row])[0] : undefined;
}

/**
 * Turn the join link on with a brand-new token valid for JOIN_LINK_TTL_SECONDS (this is also how a
 * link is reset: the old token stops working), or off (`on: false`).
 */
export function setJoinToken(groupId: string, on: boolean): void {
  if (on) {
    getDb()
      .prepare("UPDATE split_groups SET join_token = ?, join_token_expires_at = ? WHERE id = ?")
      .run(newJoinToken(), now() + JOIN_LINK_TTL_SECONDS, groupId);
  } else {
    getDb()
      .prepare("UPDATE split_groups SET join_token = NULL, join_token_expires_at = NULL WHERE id = ?")
      .run(groupId);
  }
}
