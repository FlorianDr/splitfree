import { getContactsByIds, listBillsForContact, listPaymentsForContact, type Contact } from "~/lib/db/queries.server";

/**
 * Everyone `contactId` shares a bill or payment with (excluding themselves), by contact id. This is
 * the boundary for revealing a person's display name (A01, see people.$contactId.tsx): anyone outside
 * it is shown by the email that was typed, never by a name looked up from `contacts`.
 */
export function listSharedContacts(contactId: string): Map<string, Contact> {
  const ids = new Set<string>();
  for (const b of listBillsForContact(contactId)) {
    for (const p of b.participants) ids.add(p.contactId);
  }
  for (const p of listPaymentsForContact(contactId)) {
    ids.add(p.fromContactId);
    ids.add(p.toContactId);
  }
  ids.delete(contactId);
  return getContactsByIds([...ids]);
}

/**
 * How `contactId` may see each of `ids`: the display name within their shared history, otherwise the
 * email (a settle-up counterparty from the wider circle, see settle.server.ts).
 */
export function visibleContacts(
  contactId: string,
  ids: string[],
): Map<string, { name: string; email: string; shared: boolean }> {
  const shared = listSharedContacts(contactId);
  const out = new Map<string, { name: string; email: string; shared: boolean }>();
  for (const c of getContactsByIds(ids).values()) {
    const s = shared.get(c.id);
    out.set(c.id, { name: s ? (s.displayName ?? s.email) : c.email, email: c.email, shared: !!s });
  }
  return out;
}

/** Display names by lowercased email for the shared-history contacts, plus yourself. */
export function namesByEmailFor(me: Contact): Map<string, string> {
  const names = new Map<string, string>();
  for (const c of listSharedContacts(me.id).values()) names.set(c.email, c.displayName ?? c.email);
  names.set(me.email, me.displayName ?? me.email);
  return names;
}
