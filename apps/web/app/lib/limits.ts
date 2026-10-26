/**
 * Size and abuse limits shared by the server routes and the client forms. Isomorphic on purpose (no
 * `.server` suffix): the bill form uses the bill cap to refuse expanding a group that wouldn't fit.
 */

// Sanity cap on the size of a single bill (distinct people = participants ∪ payers). Guards against
// oversized payloads and absurd splits; well above any real-world shared expense.
export const MAX_PARTICIPANTS_PER_BILL = 50;

// A04: cap how many brand-new people one account can introduce per window — bounds the invite-email
// spam/phishing blast radius. Existing contacts and the creator don't count toward the limit. Equal
// to the bill cap so a first bill for a whole group of new people always fits.
export const NEW_PARTICIPANT_WINDOW_SECONDS = 60 * 60;
export const MAX_NEW_PARTICIPANTS_PER_WINDOW = 50;

// Groups. A group (creator included) must always fit on one bill.
export const MAX_GROUP_MEMBERS = MAX_PARTICIPANTS_PER_BILL;
export const GROUP_NAME_MAX = 80;
export const MAX_GROUPS_CREATED = 50;
// Bounds how often one account can put other people's emails into groups (no email is sent, but the
// group then shows up for them).
export const GROUP_MEMBER_ADD_WINDOW_SECONDS = 60 * 60;
export const MAX_GROUP_MEMBER_ADDS_PER_WINDOW = 50;
// A join link is valid for four weeks from when it was created, reset or turned back on.
export const JOIN_LINK_TTL_SECONDS = 28 * 24 * 60 * 60;
