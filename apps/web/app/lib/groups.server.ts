import { audit } from "~/lib/audit.server";
import { countRecentAuditEvents, getContactById, type GroupWithMembers } from "~/lib/db/queries.server";
import { env } from "~/lib/env.server";
import { GROUP_MEMBER_ADD_WINDOW_SECONDS, MAX_GROUP_MEMBER_ADDS_PER_WINDOW } from "~/lib/limits";

/**
 * Per-actor limit on putting other people's emails into groups (counted from `group.member.add`
 * audit rows). Returns an error message — and audits the refusal — when `count` more would exceed it.
 */
export function memberAddRefusal(request: Request, actorContactId: string, count: number): string | null {
  const recent = countRecentAuditEvents(actorContactId, "group.member.add", GROUP_MEMBER_ADD_WINDOW_SECONDS);
  if (recent + count <= MAX_GROUP_MEMBER_ADDS_PER_WINDOW) return null;
  audit({
    event: "group.member.ratelimited",
    request,
    actorContactId,
    detail: { attempted: count, recentlyAdded: recent },
  });
  return "You've added too many people to groups recently — please try again later.";
}

/** One `group.member.add` row per added email (also feeds memberAddRefusal). */
export function auditMemberAdds(request: Request, actorContactId: string, groupId: string, emails: string[]): void {
  for (const email of emails) {
    audit({ event: "group.member.add", request, actorContactId, subjectId: groupId, detail: { email } });
  }
}

/** A01: a name only for people you share history with (`names`), otherwise the email itself. */
export const labelFor = (email: string, names: Map<string, string>): string => names.get(email) ?? email;

/** The creator, labelled the same way as members. */
export function creatorLabel(group: GroupWithMembers, names: Map<string, string>): string {
  const email = getContactById(group.createdByContactId)?.email;
  return email ? labelFor(email, names) : "Someone";
}

export function creatorEmail(group: GroupWithMembers): string | undefined {
  return getContactById(group.createdByContactId)?.email;
}

/** The absolute join URL for a token, on this instance's public origin. */
export function joinUrlFor(token: string): string {
  return `${env.WEBAUTHN_ORIGIN.replace(/\/$/, "")}/groups/join/${token}`;
}
