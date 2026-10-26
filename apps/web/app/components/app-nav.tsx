import { ArrowLeftRight, Plus, Settings, Users } from "lucide-react";
import { Link } from "react-router";
import { NavigationProgress } from "~/components/navigation-progress";
import { Button } from "~/components/ui/button";

export interface NavMe {
  id: string;
  email: string;
  displayName: string | null;
}

export function AppNav({ me }: { me: NavMe }) {
  // Pinned like a native nav bar. The progress bar rides its bottom edge rather than the viewport's
  // top, where iOS Safari's status bar and toolbar can cover it. Named for view transitions so it
  // stays put while the page below cross-fades.
  return (
    <header className="sticky top-0 z-40 border-b bg-card [view-transition-name:app-header]">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-2 px-4 py-3">
        <Link viewTransition to="/" className="font-display text-lg font-semibold tracking-tight">
          split<span className="text-primary">free</span>
        </Link>
        <nav className="flex items-center gap-1">
          <Button asChild variant="ghost" size="sm">
            <Link viewTransition to="/settle" aria-label="Settle up">
              <ArrowLeftRight className="size-4" />
              <span className="hidden sm:inline">Settle up</span>
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link viewTransition to="/groups" aria-label="Groups">
              <Users className="size-4" />
              <span className="hidden sm:inline">Groups</span>
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link viewTransition to="/bills/new">
              <Plus className="size-4" />
              Add bill
            </Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            size="icon"
            aria-label="Settings"
            title={me.displayName ?? me.email}
          >
            <Link viewTransition to="/settings">
              <Settings className="size-4" />
            </Link>
          </Button>
        </nav>
      </div>
      <NavigationProgress className="absolute inset-x-0 -bottom-px h-0.5" />
    </header>
  );
}
