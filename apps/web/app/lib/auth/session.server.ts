import { redirect } from "react-router";
import { loginUrlFor, returnPathFor } from "~/lib/redirect";
import { isProduction } from "~/lib/env.server";
import {
  createSession,
  getContactById,
  getUserById,
  isSessionActive,
  revokeSession,
  type Contact,
  type User,
} from "~/lib/db/queries.server";
import { signJwt, verifyJwt } from "./jwt.server";

const COOKIE_NAME = "__sf_session";
const SESSION_SECONDS = 30 * 24 * 60 * 60; // 30 days

export interface AuthedUser {
  user: User;
  contact: Contact;
}

function buildCookie(value: string, maxAgeSeconds: number): string {
  const attrs = [
    `${COOKIE_NAME}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (isProduction) attrs.push("Secure");
  return attrs.join("; ");
}

function readToken(request: Request): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    if (trimmed.slice(0, eq) === COOKIE_NAME) return trimmed.slice(eq + 1);
  }
  return null;
}

/** Build the Set-Cookie header value for a freshly created login session. */
export function createUserSessionCookie(userId: string, contactId: string): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const sid = createSession(userId, exp);
  const token = signJwt({ sub: userId, cid: contactId, sid, exp });
  return buildCookie(token, SESSION_SECONDS);
}

/** Revoke the request's session (if any) and return a Set-Cookie that clears the cookie. */
export function destroyUserSessionCookie(request: Request): string {
  const token = readToken(request);
  if (token) {
    const payload = verifyJwt(token);
    if (payload) revokeSession(payload.sid);
  }
  return buildCookie("", 0);
}

export function getOptionalUser(request: Request): AuthedUser | null {
  const token = readToken(request);
  if (!token) return null;
  const payload = verifyJwt(token);
  if (!payload) return null;
  if (!isSessionActive(payload.sid)) return null;
  const user = getUserById(payload.sub);
  if (!user) return null;
  const contact = getContactById(user.contactId);
  if (!contact) return null;
  return { user, contact };
}

export function requireUser(request: Request): AuthedUser {
  const authed = getOptionalUser(request);
  if (!authed) {
    // A GET (a page someone opened, e.g. a join link) comes back to where it was after login; a
    // submission can't be replayed, so it lands on a plain /login.
    throw redirect(request.method === "GET" ? loginUrlFor(returnPathFor(request.url)) : "/login");
  }
  return authed;
}

// A07 step-up: sensitive actions (e.g. adding a passkey) require a *recently* authenticated session,
// not just any valid 30-day one — so a hijacked long-lived cookie can't silently register an
// attacker passkey for persistence. The JWT's `iat` is the authentication time (every login mints a
// fresh token), so freshness needs no extra storage.
const STEP_UP_WINDOW_SECONDS = 15 * 60;

/** Throw 401 unless the request's session was authenticated within `maxAgeSeconds`. */
export function requireRecentAuth(request: Request, maxAgeSeconds = STEP_UP_WINDOW_SECONDS): void {
  const token = readToken(request);
  const payload = token ? verifyJwt(token) : null;
  if (!payload || Math.floor(Date.now() / 1000) - payload.iat > maxAgeSeconds) {
    throw new Response("Re-authentication required", { status: 401 });
  }
}
