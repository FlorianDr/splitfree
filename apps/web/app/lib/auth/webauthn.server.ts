import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { env } from "~/lib/env.server";
import {
  getCredentialByCredentialId,
  insertChallenge,
  insertCredential,
  listCredentialsByUser,
  takeChallenge,
  updateCredentialCounter,
  type Contact,
  type User,
} from "~/lib/db/queries.server";

const rpID = env.WEBAUTHN_RP_ID;
const rpName = env.WEBAUTHN_RP_NAME;
const origin = env.WEBAUTHN_ORIGIN;

// Passkeys registered before SimpleWebAuthn 14 may have stored "cable" or "smart-card", which it no
// longer accepts; drop anything outside the current set rather than pass it to the library.
const TRANSPORTS: ReadonlySet<string> = new Set<AuthenticatorTransport>([
  "ble",
  "hybrid",
  "internal",
  "nfc",
  "usb",
]);

function parseTransports(json: string | null): AuthenticatorTransport[] | undefined {
  if (!json) return undefined;
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return undefined;
    return parsed.filter(
      (t): t is AuthenticatorTransport => typeof t === "string" && TRANSPORTS.has(t),
    );
  } catch {
    return undefined;
  }
}

/** Build registration options for a logged-in user adding their first/another passkey. */
export async function registrationOptions(user: User, contact: Contact) {
  const existing = listCredentialsByUser(user.id);
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: contact.email,
    userID: new TextEncoder().encode(user.id),
    userDisplayName: contact.displayName ?? contact.email,
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({
      id: c.credentialId,
      transports: parseTransports(c.transports),
    })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
  });
  const challengeId = insertChallenge({
    challenge: options.challenge,
    type: "register",
    userId: user.id,
  });
  return { options, challengeId };
}

export async function verifyRegistration(
  challengeId: string,
  response: RegistrationResponseJSON,
  user: User,
): Promise<boolean> {
  const ch = takeChallenge(challengeId);
  if (!ch || ch.type !== "register" || ch.userId !== user.id) return false;

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: ch.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: false,
  });
  if (!verification.verified || !verification.registrationInfo) return false;

  const { credential } = verification.registrationInfo;
  insertCredential({
    userId: user.id,
    credentialId: credential.id,
    // Normalize to a concrete ArrayBuffer-backed view for node:sqlite's BLOB binding.
    publicKey: new Uint8Array(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports ?? null,
  });
  return true;
}

/**
 * Build authentication options for the usernameless / discoverable-credential flow. We deliberately
 * never scope by email (no `allowCredentials`): the authenticator presents whatever passkeys it holds
 * for this RP, and the response shape is identical regardless of which account exists — so this public
 * endpoint can't be used to enumerate accounts or their passkeys (A07 / CWE-204).
 */
export async function authenticationOptions() {
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
  });
  const challengeId = insertChallenge({ challenge: options.challenge, type: "login" });
  return { options, challengeId };
}

/** Verify a passkey assertion. Returns the owning userId on success, else null. */
export async function verifyAuthentication(
  challengeId: string,
  response: AuthenticationResponseJSON,
): Promise<string | null> {
  const ch = takeChallenge(challengeId);
  if (!ch || ch.type !== "login") return null;

  const cred = getCredentialByCredentialId(response.id);
  if (!cred) return null;

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: ch.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: false,
    credential: {
      id: cred.credentialId,
      publicKey: new Uint8Array(cred.publicKey),
      counter: cred.counter,
      transports: parseTransports(cred.transports),
    },
  });
  if (!verification.verified) return null;

  updateCredentialCounter(cred.credentialId, verification.authenticationInfo.newCounter);
  return cred.userId;
}
