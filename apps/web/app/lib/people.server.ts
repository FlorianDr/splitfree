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

/** Display names by lowercased email for the shared-history contacts, plus yourself. */
export function namesByEmailFor(me: Contact): Map<string, string> {
  const names = new Map<string, string>();
  for (const c of listSharedContacts(me.id).values()) names.set(c.email, c.displayName ?? c.email);
  names.set(me.email, me.displayName ?? me.email);
  return names;
}
