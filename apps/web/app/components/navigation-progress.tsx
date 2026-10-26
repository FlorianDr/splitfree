import { useEffect, useRef } from "react";
import { cn } from "~/lib/utils";
import { useSlowNavigation } from "~/lib/use-slow-navigation";

// While loading, the bar eases towards CRAWL_TO and never completes on its own: it only reaches the
// end when the navigation actually settles, so it can't claim "done" early.
const CRAWL_TO = 0.9;
const CRAWL_MS = 8000;
const FINISH_MS = 300;

/**
 * Thin progress bar for route navigations and `<Form>` submissions — the native-app cue that a tap
 * registered while the server renders the next page. Placement comes from `className`: the app shell
 * pins it to the header's bottom edge (clear of the iOS status bar), other pages to the top.
 * Driven by the Web Animations API (no library, no re-render per frame); decorative, so hidden from
 * assistive tech.
 */
export function NavigationProgress({ className }: { className?: string }) {
  const slow = useSlowNavigation() !== null;
  const bar = useRef<HTMLDivElement>(null);
  const shown = useRef(false);

  useEffect(() => {
    const el = bar.current;
    if (!el) return;

    if (slow) {
      shown.current = true;
      for (const a of el.getAnimations()) a.cancel();
      el.style.opacity = "1";
      const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.animate(
        reduceMotion
          ? [{ transform: "scaleX(1)" }, { transform: "scaleX(1)" }]
          : [{ transform: "scaleX(0)" }, { transform: `scaleX(${CRAWL_TO})` }],
        { duration: CRAWL_MS, easing: "cubic-bezier(0.1, 0.6, 0.2, 1)", fill: "forwards" },
      );
      return;
    }

    if (!shown.current) return;
    shown.current = false;
    // Freeze the crawl where it is, then run to the end and fade out from there.
    for (const a of el.getAnimations()) {
      a.commitStyles();
      a.cancel();
    }
    el.animate(
      [{ opacity: 1 }, { transform: "scaleX(1)", opacity: 1, offset: 0.5 }, { transform: "scaleX(1)", opacity: 0 }],
      { duration: FINISH_MS, easing: "ease-out" },
    );
    el.style.opacity = "0";
  }, [slow]);

  return (
    <div
      ref={bar}
      aria-hidden="true"
      data-slot="navigation-progress"
      className={cn(
        "pointer-events-none origin-left bg-primary opacity-0 will-change-transform",
        className,
      )}
    />
  );
}
