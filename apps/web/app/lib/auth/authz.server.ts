import {
  getBillWithParticipants,
  getGroupWithMembers,
  type BillWithParticipants,
  type GroupWithMembers,
} from "~/lib/db/queries.server";

/**
 * Object-level authorization (OWASP A01). `requireUser` proves *who* you are; these helpers prove
 * you're allowed to touch a *specific* object. Every financial read/write must pass one of these —
 * authenticating a request is necessary but not sufficient.
 */

/**
 * Load a bill and assert `contactId` is one of its participants, returning the loaded bill.
 * Throws 404 (not 403) for both "missing" and "not a participant" so a non-participant cannot probe
 * which bill ids exist.
 */
export function requireBillParticipant(billId: string, contactId: string): BillWithParticipants {
  const bill = getBillWithParticipants(billId);
  if (!bill || !bill.participants.some((p) => p.contactId === contactId)) {
    throw new Response("Not found", { status: 404 });
  }
  return bill;
}

/** Assert the acting contact is one of the two parties to a payment; 403 otherwise. */
export function assertPaymentParty(
  actingContactId: string,
  fromContactId: string,
  toContactId: string,
): void {
  if (actingContactId !== fromContactId && actingContactId !== toContactId) {
    throw new Response("Forbidden", { status: 403 });
  }
}

/**
 * Load a group and assert `email` is one of its members. 404 (not 403) for both "missing" and "not a
 * member", so a non-member cannot probe which group ids exist — groups never appear to outsiders.
 */
export function requireGroupMember(groupId: string, email: string): GroupWithMembers {
  const group = getGroupWithMembers(groupId);
  const normalized = email.trim().toLowerCase();
  if (!group || !group.members.some((m) => m.email === normalized)) {
    throw new Response("Not found", { status: 404 });
  }
  return group;
}

/** Only a group's creator may remove others, rename, delete or manage the join link; 403 otherwise. */
export function assertGroupCreator(group: GroupWithMembers, contactId: string): void {
  if (group.createdByContactId !== contactId) {
    throw new Response("Forbidden", { status: 403 });
  }
}
