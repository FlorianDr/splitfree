/**
 * Wero share links, the P2P "pay me" link Wero's apps hand out: https://share.wero-wallet.eu/p/1/c/<token>
 * (what Revolut's Wero hands out) or https://share.weropay.eu/p/1/s/<token>. Isomorphic on purpose (no
 * `.server` suffix): the settings form checks as you type, the action checks again on the server.
 *
 * The link is never stored as typed: it's rebuilt from an allowed host, path kind and token, so
 * splitfree never shows someone else a link that points anywhere else.
 */

export type WeroResult = { ok: true; link: string } | { ok: false; error: string };

const WERO_HOSTS = ["share.wero-wallet.eu", "share.weropay.eu"];
// Undocumented format; the token is treated as opaque, limited to URL-safe characters so it can go
// back into a path unescaped.
const WERO_PATH = /^\/p\/1\/([cs])\/([A-Za-z0-9._~-]{4,256})\/?$/;

/** A Wero share link (any amount or other query is dropped) → the clean link. */
export function parseWeroLink(input: string): WeroResult {
  let s = input.trim();
  if (s === "") return { ok: false, error: "Paste your Wero link." };
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = `https://${s}`;
  let url: URL | null = null;
  try {
    url = new URL(s);
  } catch {
    // falls through to the error below
  }
  const match =
    url && url.protocol === "https:" && WERO_HOSTS.includes(url.hostname)
      ? WERO_PATH.exec(url.pathname)
      : null;
  if (!url || !match) {
    return { ok: false, error: `That isn't a Wero link. It starts with https://${WERO_HOSTS[0]}/p/1/` };
  }
  return { ok: true, link: `https://${url.hostname}/p/1/${match[1]}/${match[2]}` };
}
