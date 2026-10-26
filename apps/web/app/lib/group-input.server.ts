import { z } from "zod";
import { GROUP_NAME_MAX, MAX_GROUP_MEMBERS } from "~/lib/limits";

// The bill action validates participants with z.string().email(); a group must never hold an email
// that check would reject, or adding the group would make the whole bill fail with "Invalid bill data".
const emailSchema = z.string().max(254).email();

/** Trim + lowercase, as everywhere else emails are stored (queries.server.ts `normalizeEmail`). */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/** Parse a group name: trimmed, 1–GROUP_NAME_MAX characters. */
export function parseGroupName(raw: unknown): { name: string } | { error: string } {
  const name = typeof raw === "string" ? raw.trim() : "";
  if (!name) return { error: "Give the group a name." };
  if (name.length > GROUP_NAME_MAX) {
    return { error: `The group name is too long (max ${GROUP_NAME_MAX} characters).` };
  }
  return { name };
}

/**
 * Parse a JSON array of member emails: normalized, deduplicated, each checked like the bill action
 * does. Returns every invalid entry so the form can say which one failed.
 */
export function parseMemberEmails(raw: unknown, maxCount: number): { emails: string[] } | { error: string } {
  let list: unknown;
  try {
    list = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return { error: "Invalid member list." };
  }
  if (!Array.isArray(list) || list.length > maxCount * 2) return { error: "Invalid member list." };
  const emails: string[] = [];
  const bad: string[] = [];
  for (const item of list) {
    if (typeof item !== "string") return { error: "Invalid member list." };
    const email = normalizeEmail(item);
    if (!emailSchema.safeParse(email).success) bad.push(item.trim() || "(empty)");
    else if (!emails.includes(email)) emails.push(email);
  }
  if (bad.length > 0) {
    return { error: `Not a valid email address: ${bad.slice(0, 3).join(", ")}${bad.length > 3 ? "…" : ""}` };
  }
  if (emails.length > maxCount) return { error: `A group can have at most ${MAX_GROUP_MEMBERS} people.` };
  return { emails };
}
