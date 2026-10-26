import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";

type Shape = "home" | "list" | "person" | "form";

/** Which placeholder resembles the page at `pathname`, or `null` for pages outside the app shell. */
function shapeFor(pathname: string): Shape | null {
  if (pathname === "/") return "home";
  if (["/bills/new", "/payments/new", "/settings"].includes(pathname)) return "form";
  if (pathname.startsWith("/people/")) return "person";
  if (/^\/(settle|groups|bills)(\/|$)/.test(pathname)) return "list";
  return null;
}

export function hasPageSkeleton(pathname: string): boolean {
  return shapeFor(pathname) !== null;
}

/**
 * Placeholder for the page being loaded, shaped like its real layout (same cards, rows and spacing)
 * so the content lands where the eye already is. Shown by the app shell for slow navigations only.
 */
export function PageSkeleton({ pathname }: { pathname: string }) {
  const shape = shapeFor(pathname);
  if (!shape) return null;

  return (
    <div role="status" className="animate-in fade-in duration-200">
      <span className="sr-only">Loading…</span>
      {shape === "home" ? <HomeSkeleton /> : null}
      {shape === "list" ? <ListPageSkeleton /> : null}
      {shape === "person" ? <PersonSkeleton /> : null}
      {shape === "form" ? <FormSkeleton /> : null}
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-card p-5">
        <Bone className="h-4 w-24" />
        <Bone className="mt-2 h-8 w-48" />
      </section>
      <div className="space-y-3">
        <Bone className="h-9 w-40 rounded-lg" />
        <RowsSkeleton rows={4} />
      </div>
    </div>
  );
}

function ListPageSkeleton() {
  return (
    <div className="space-y-4">
      <TitleSkeleton subtitle />
      <RowsSkeleton rows={3} />
    </div>
  );
}

function PersonSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Bone className="size-11 rounded-full" />
        <div className="space-y-1.5">
          <Bone className="h-6 w-36" />
          <Bone className="h-4 w-48" />
        </div>
      </div>
      <div className="rounded-xl border bg-card p-4">
        <Bone className="h-4 w-28" />
        <Bone className="mt-2 h-7 w-36" />
      </div>
      <RowsSkeleton rows={3} />
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="space-y-4">
      <TitleSkeleton />
      <div className="space-y-5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-1.5">
            <Bone className="h-4 w-24" />
            <Bone className="h-9 w-full" />
          </div>
        ))}
        <Bone className="h-9 w-full" />
      </div>
    </div>
  );
}

function TitleSkeleton({ subtitle = false }: { subtitle?: boolean }) {
  return (
    <div className="space-y-2">
      <Bone className="h-8 w-44" />
      {subtitle ? <Bone className="h-4 w-72 max-w-full" /> : null}
    </div>
  );
}

// Varied widths so the rows read as names and amounts, not a barcode.
const ROW_WIDTHS = [
  ["w-28", "w-40", "w-14"],
  ["w-36", "w-32", "w-16"],
  ["w-24", "w-44", "w-12"],
  ["w-32", "w-36", "w-14"],
] as const;

function RowsSkeleton({ rows }: { rows: number }) {
  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card">
      {ROW_WIDTHS.slice(0, rows).map(([name, detail, amount], i) => (
        <li key={i} className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Bone className="size-9 shrink-0 rounded-full" />
            <div className="space-y-1.5">
              <Bone className={`h-4 ${name}`} />
              <Bone className={`h-3 ${detail}`} />
            </div>
          </div>
          <Bone className={`h-4 ${amount}`} />
        </li>
      ))}
    </ul>
  );
}

// The stock skeleton tint barely shows on white cards; a neutral ink wash reads in both themes.
function Bone({ className }: { className?: string }) {
  return <Skeleton className={cn("bg-foreground/10", className)} />;
}
