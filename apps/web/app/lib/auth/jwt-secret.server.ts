import { randomBytes } from "node:crypto";

/**
 * Resolve the HS256 session-signing secret (OWASP A02). Rules:
 *
 *  - An explicitly configured secret is always used verbatim.
 *  - In production, a missing secret returns `undefined` so boot validation fails closed — we never
 *    fall back to a default in prod.
 *  - Outside production, a missing secret is filled with a RANDOM per-process value, never a
 *    hardcoded constant. A shipped constant would let anyone forge sessions if `NODE_ENV` were ever
 *    misconfigured in a real deployment (CWE-321 hard-coded key). The trade-off — dev sessions reset
 *    when the server restarts — is harmless.
 */
export function resolveJwtSecret(provided: string | undefined, isProd: boolean): string | undefined {
  if (provided) return provided;
  return isProd ? undefined : randomBytes(48).toString("base64");
}
