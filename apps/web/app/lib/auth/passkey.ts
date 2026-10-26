import { startAuthentication, startRegistration } from "@simplewebauthn/browser";

/** Browser-side passkey flows. Each talks to the JSON resource routes under /api/webauthn/*. */

/** `reauth` = the server requires a fresh sign-in before this sensitive action (A07 step-up). */
export type PasskeyResult = "ok" | "reauth" | "failed";

export async function registerPasskey(): Promise<PasskeyResult> {
  const optRes = await fetch("/api/webauthn/register/options", { method: "POST" });
  if (optRes.status === 401) return "reauth";
  if (!optRes.ok) return "failed";
  const { options, challengeId } = await optRes.json();

  let attestation;
  try {
    attestation = await startRegistration({ optionsJSON: options });
  } catch {
    return "failed"; // user cancelled or no authenticator
  }

  const verifyRes = await fetch("/api/webauthn/register/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeId, response: attestation }),
  });
  if (verifyRes.status === 401) return "reauth";
  const data = await verifyRes.json().catch(() => ({}));
  return data.verified ? "ok" : "failed";
}

export async function loginWithPasskey(): Promise<boolean> {
  // Usernameless / discoverable-credential flow — no email is sent, so the options endpoint can't be
  // used to probe whether an account exists (A07 enumeration).
  const optRes = await fetch("/api/webauthn/login/options", { method: "POST" });
  if (!optRes.ok) return false;
  const { options, challengeId } = await optRes.json();

  let assertion;
  try {
    assertion = await startAuthentication({ optionsJSON: options });
  } catch {
    return false;
  }

  const verifyRes = await fetch("/api/webauthn/login/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeId, response: assertion }),
  });
  const data = await verifyRes.json();
  return Boolean(data.verified);
}
