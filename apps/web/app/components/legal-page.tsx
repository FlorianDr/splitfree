import { Link } from "react-router";

/**
 * Shared shell for the public legal pages (Terms, Privacy). Mirrors the auth-card look:
 * a centered prose card on the soft secondary background, with splitfree branding and a
 * footer that cross-links the legal pages and the sign-in screen. Child <h2>/<p>/<ul>/<a>
 * elements are styled via descendant selectors so the content files stay plain markup.
 */
export function LegalPage({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-svh bg-secondary/40 px-4 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <Link to="/login" className="font-display text-2xl font-bold tracking-tight">
          split<span className="text-primary">free</span>
        </Link>

        <article className="mt-8 rounded-2xl border bg-card p-6 shadow-sm sm:p-10">
          <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
          {lastUpdated ? (
            <p className="mt-2 text-sm text-muted-foreground">Last updated: {lastUpdated}</p>
          ) : null}
          <div
            className="mt-8 space-y-4 text-sm leading-relaxed
              [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground
              [&_p]:text-muted-foreground
              [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_li]:text-muted-foreground
              [&_a]:text-primary [&_a]:underline [&_strong]:font-semibold [&_strong]:text-foreground"
          >
            {children}
          </div>
        </article>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link to="/terms" className="hover:text-foreground">
            Terms
          </Link>
          <span className="mx-2">·</span>
          <Link to="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <span className="mx-2">·</span>
          <Link to="/impressum" className="hover:text-foreground">
            Impressum
          </Link>
          <span className="mx-2">·</span>
          <Link to="/login" className="hover:text-foreground">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
