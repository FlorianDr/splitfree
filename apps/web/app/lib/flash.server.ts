/**
 * One-shot flash messages via a short-lived cookie. An action sets it alongside a redirect; the
 * root loader reads it, clears it, and hands it to the client, which shows a toast. This is how
 * success messages survive a server-side redirect (where there is no actionData on the destination).
 */
const COOKIE = "__sf_flash";

export type FlashType = "success" | "error" | "info";
export interface Flash {
  type: FlashType;
  message: string;
}

export function flashCookie(type: FlashType, message: string): string {
  const value = encodeURIComponent(JSON.stringify({ type, message } satisfies Flash));
  return `${COOKIE}=${value}; Path=/; Max-Age=15; SameSite=Lax; HttpOnly`;
}

export const clearFlashCookie = `${COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly`;

export function readFlash(request: Request): Flash | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1 || trimmed.slice(0, eq) !== COOKIE) continue;
    try {
      const parsed = JSON.parse(decodeURIComponent(trimmed.slice(eq + 1))) as Flash;
      if (parsed && typeof parsed.message === "string") return parsed;
    } catch {
      return null;
    }
  }
  return null;
}
