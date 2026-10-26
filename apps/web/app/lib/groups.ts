/**
 * Pure helpers for adding a group to a bill's participant list. Isomorphic and dependency-free so the
 * bill form can use them in the browser and `node --test` can run them directly.
 */

export interface GroupOption {
  id: string;
  name: string;
  /** Normalized member emails (the creator included). */
  members: string[];
}

export interface ContactOption {
  email: string;
  name: string;
}

export type Suggestion =
  | ({ kind: "contact" } & ContactOption)
  | ({ kind: "group" } & GroupOption);

export interface MergeResult {
  /** The new participant list (unchanged when the merge would overflow). */
  next: string[];
  /** Emails that were newly added. */
  added: string[];
  /** Group members already on the bill. */
  alreadyIn: string[];
  /** True when adding the group would exceed `max`; nothing is added then. */
  overflow: boolean;
}

/**
 * Append `members` to `current`, keeping order and skipping emails already present
 * (case-insensitive). All or nothing: if the result would exceed `max` people, `current` is returned
 * unchanged with `overflow: true` — adding part of a group silently would be surprising.
 */
export function mergeMembers(current: string[], members: string[], max: number): MergeResult {
  const seen = new Set(current.map((e) => e.toLowerCase()));
  const added: string[] = [];
  const alreadyIn: string[] = [];
  for (const raw of members) {
    const email = raw.trim().toLowerCase();
    if (!email) continue;
    if (seen.has(email)) {
      if (!added.includes(email)) alreadyIn.push(email);
      continue;
    }
    seen.add(email);
    added.push(email);
  }
  if (current.length + added.length > max) {
    return { next: current, added: [], alreadyIn, overflow: true };
  }
  return { next: [...current, ...added], added, alreadyIn, overflow: false };
}

const MAX_SUGGESTIONS = 6;
const MAX_GROUP_SUGGESTIONS = 3;

/**
 * Type-ahead matches for `query`: groups whose name contains it (hidden once every member is already
 * added), then contacts whose name or email contains it, not already added. Case-insensitive; at
 * most 3 groups and 6 suggestions in total.
 */
export function matchSuggestions(
  query: string,
  contacts: ContactOption[],
  groups: GroupOption[],
  exclude: string[],
): Suggestion[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const excluded = new Set(exclude.map((e) => e.toLowerCase()));

  const groupMatches: Suggestion[] = groups
    .filter((g) => g.name.toLowerCase().includes(q))
    .filter((g) => g.members.some((m) => !excluded.has(m.toLowerCase())))
    .slice(0, MAX_GROUP_SUGGESTIONS)
    .map((g) => ({ kind: "group", ...g }));

  const contactMatches: Suggestion[] = contacts
    .filter((c) => !excluded.has(c.email.toLowerCase()))
    .filter((c) => c.email.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))
    .map((c) => ({ kind: "contact", ...c }));

  return [...groupMatches, ...contactMatches].slice(0, MAX_SUGGESTIONS);
}
