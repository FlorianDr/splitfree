import type { MetaDescriptor } from "react-router";

/**
 * Social link previews (Open Graph + Twitter Card) in one place.
 *
 * React Router does NOT merge `meta` across nested routes — the leaf route's array replaces the
 * parent's outright — so every route runs its `meta` through {@link pageMeta} to keep the title,
 * description, and social-card tags consistent on every page.
 *
 * Absolute URLs (`og:url`, `og:image`) are required by scrapers but must not be hard-coded: the app
 * is self-hostable, so each instance advertises its own origin. The origin is read from the root
 * loader (sourced from the configured `WEBAUTHN_ORIGIN`, the canonical externally-visible URL) and
 * threaded in via the route `matches`.
 */

export const SITE_NAME = "splitfree";

const SITE_TAGLINE = "free, open-source bill splitting";

export const SITE_DESCRIPTION =
  "A completely free, open-source bill-splitting app you can host yourself. Split bills, record settle-up payments, " +
  "and settle a group in the fewest transactions. Always free — no ads, no paywall.";

/** 1200×630 card in /public — regenerate with `bash apps/web/scripts/gen-og.sh`. */
const OG_IMAGE_PATH = "/og.png";
const OG_IMAGE_WIDTH = "1200";
const OG_IMAGE_HEIGHT = "630";

type MetaInput = {
  /** Page-specific title, composed as `"<title> · splitfree"`. Omit for the landing/brand title. */
  title?: string;
  description?: string;
  /** Path of the current page (e.g. `"/settle"`), joined to the origin for `og:url`. */
  path?: string;
};

/**
 * Minimal shape of React Router's `matches` we rely on — kept loose so any route's tuple fits.
 * Entries can be `undefined` (pathless/unmatched layout slots), so the element type allows it.
 */
type RouteMatches = readonly ({ readonly id: string; readonly loaderData: unknown } | undefined)[];

function originFromMatches(matches: RouteMatches): string {
  const root = matches.find((m) => m?.id === "root");
  const data = root?.loaderData as { siteOrigin?: string } | undefined;
  return data?.siteOrigin ?? "";
}

/**
 * Build the full `<title>` + Open Graph + Twitter Card descriptor set for a page. Pass the route's
 * `matches` (to resolve the per-request origin) and an optional per-page title/description/path.
 */
export function pageMeta(
  matches: RouteMatches,
  { title, description = SITE_DESCRIPTION, path = "/" }: MetaInput = {},
): MetaDescriptor[] {
  const origin = originFromMatches(matches);
  const fullTitle = title ? `${title} · ${SITE_NAME}` : `${SITE_NAME} — ${SITE_TAGLINE}`;
  const url = origin + path;
  const image = origin + OG_IMAGE_PATH;
  const imageAlt = `${SITE_NAME} — ${SITE_TAGLINE}`;

  return [
    { title: fullTitle },
    { name: "description", content: description },

    // Open Graph (Facebook, LinkedIn, Slack, iMessage, …)
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:title", content: fullTitle },
    { property: "og:description", content: description },
    { property: "og:url", content: url },
    { property: "og:image", content: image },
    { property: "og:image:width", content: OG_IMAGE_WIDTH },
    { property: "og:image:height", content: OG_IMAGE_HEIGHT },
    { property: "og:image:alt", content: imageAlt },

    // Twitter / X
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: fullTitle },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image },
    { name: "twitter:image:alt", content: imageAlt },
  ];
}
