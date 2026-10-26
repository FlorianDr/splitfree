/**
 * Post-login return paths. Isomorphic and dependency-free (used by loaders, actions and the login
 * page's passkey flow, and unit-tested with `node --test`).
 */

/**
 * A01 (CWE-601): only honor same-site, absolute-path redirects — never an external URL or a
 * protocol-relative "//host" / "/\host" that the browser would resolve off-site. Anything else
 * (missing, relative, absolute URL, control characters) falls back to "/".
 */
export function safeRedirectPath(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) return "/";
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  // Browsers strip tab/newline inside URLs, which could turn "/\t/host" into "//host".
  if (/[\u0000-\u001f\u007f]/.test(value)) return "/";
  return value;
}

/** Add (or replace) one query parameter on a same-site path, keeping any existing query and hash. */
export function withParam(path: string, key: string, value: string): string {
  const url = new URL(path, "http://x");
  url.searchParams.set(key, value);
  return url.pathname + url.search + url.hash;
}

/**
 * The path to come back to after login for a request URL: its pathname and query, minus React
 * Router's single-fetch artefacts (a ".data" suffix and the "_routes" parameter).
 */
export function returnPathFor(requestUrl: string): string {
  const url = new URL(requestUrl);
  let pathname = url.pathname;
  if (pathname === "/_root.data") pathname = "/";
  else if (pathname.endsWith(".data")) pathname = pathname.slice(0, -".data".length) || "/";
  url.searchParams.delete("_routes");
  const search = url.searchParams.toString();
  return pathname + (search ? `?${search}` : "");
}

/** The login URL that brings the visitor back to `path` afterwards ("/" needs no parameter). */
export function loginUrlFor(path: string): string {
  const target = safeRedirectPath(path);
  return target === "/" ? "/login" : `/login?redirectTo=${encodeURIComponent(target)}`;
}
