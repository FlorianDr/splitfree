import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "~/lib/env.server";

/**
 * Minimal hand-rolled HS256 JWT using node:crypto (platform over library — no jose). The token is
 * the session cookie value: `base64url(header).base64url(payload).base64url(hmac)`.
 */
export interface JwtPayload {
  sub: string; // user id
  cid: string; // contact id
  sid: string; // session id
  iat: number;
  exp: number; // unix seconds
}

const HEADER = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");

function sign(data: string): string {
  return createHmac("sha256", env.JWT_SECRET).update(data).digest("base64url");
}

export function signJwt(claims: Omit<JwtPayload, "iat">): string {
  const payload: JwtPayload = { ...claims, iat: Math.floor(Date.now() / 1000) };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const data = `${HEADER}.${payloadB64}`;
  return `${data}.${sign(data)}`;
}

export function verifyJwt(token: string): JwtPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sig] = parts;
  if (!headerB64 || !payloadB64 || !sig) return null;

  const expected = Buffer.from(sign(`${headerB64}.${payloadB64}`), "base64url");
  const provided = Buffer.from(sig, "base64url");
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;

  let payload: JwtPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as JwtPayload;
  } catch {
    return null;
  }
  if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}
