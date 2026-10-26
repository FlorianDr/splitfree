import { useEffect, useState } from "react";
import { useNavigation } from "react-router";

// Navigations that finish sooner than this show no loading UI at all, so quick taps don't flicker.
const SLOW_NAVIGATION_MS = 150;

/**
 * The pending navigation once it has been in flight for longer than {@link SLOW_NAVIGATION_MS},
 * otherwise `null`. Shared by the progress bar and the page skeletons so both appear together.
 */
export function useSlowNavigation(): ReturnType<typeof useNavigation> | null {
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!busy) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), SLOW_NAVIGATION_MS);
    return () => clearTimeout(timer);
  }, [busy]);

  return busy && slow ? navigation : null;
}
