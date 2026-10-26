import { isIP } from "node:net";

/**
 * Client-IP parsing for abuse limits and the audit trail. Pure (node:net only) so node:test can load
 * it directly.
 *
 * The app always sits behind a reverse proxy, so the TCP peer is the proxy, never the visitor. The
 * visitor IP is read from ONE header that the proxy overwrites (CLIENT_IP_HEADER — in production
 * Caddy's `header_up X-Real-IP {client_ip}`). Every other header, X-Forwarded-For and
 * CF-Connecting-IP included, can be sent by the client itself and is never trusted here.
 */

/** Expand an IPv6 address (already validated by `isIP`) into its eight 16-bit groups. */
function expandV6(ip: string): number[] | null {
  let s = ip.toLowerCase();
  // An embedded IPv4 tail (::ffff:1.2.3.4, 2001:db8::1.2.3.4) becomes the last two groups.
  const v4 = s.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number) as [number, number, number, number];
    s = `${s.slice(0, -v4[0].length)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head = "", tail] = s.split("::");
  const h = head ? head.split(":") : [];
  const groups =
    tail === undefined
      ? h
      : [...h, ...Array<string>(8 - h.length - (tail ? tail.split(":").length : 0)).fill("0"), ...(tail ? tail.split(":") : [])];
  if (groups.length !== 8) return null;
  return groups.map((g) => Number.parseInt(g, 16));
}

/**
 * Normalize one IP string: trims, drops an IPv6 zone id, and turns an IPv4-mapped IPv6 address into
 * plain IPv4. Returns null for anything that isn't exactly one valid address (e.g. "a, b").
 */
export function parseIp(value: string | null | undefined): string | null {
  if (!value) return null;
  const s = value.trim().replace(/%.*$/, "");
  const version = isIP(s);
  if (version === 4) return s;
  if (version !== 6) return null;
  const g = expandV6(s);
  if (!g) return null;
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
    const [hi = 0, lo = 0] = g.slice(6);
    return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join(".");
  }
  return s.toLowerCase();
}

/** The visitor IP from the configured proxy header, or null if none is configured, sent, or valid. */
export function clientIpFrom(headers: Headers, headerName: string | undefined): string | null {
  if (!headerName) return null;
  return parseIp(headers.get(headerName));
}

/**
 * Rate-limit buckets for an IP. `narrow` is what one subscriber controls (an IPv4 address, or an IPv6
 * /64, since a single home or VPS usually gets a whole /64); `wide` catches one actor rotating through
 * neighbours (IPv4 /24, IPv6 /48).
 */
export interface IpBuckets {
  narrow: string;
  wide: string;
}

export function ipBuckets(ip: string | null): IpBuckets | null {
  const parsed = parseIp(ip);
  if (!parsed) return null;
  if (isIP(parsed) === 4) {
    const [a, b, c] = parsed.split(".");
    return { narrow: parsed, wide: `${a}.${b}.${c}.0/24` };
  }
  const g = expandV6(parsed);
  if (!g) return null;
  const hex = (xs: number[]) => xs.map((x) => x.toString(16)).join(":");
  return { narrow: `${hex(g.slice(0, 4))}::/64`, wide: `${hex(g.slice(0, 3))}::/48` };
}
