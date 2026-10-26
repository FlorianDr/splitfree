import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("languagechange", onChange);
  return () => window.removeEventListener("languagechange", onChange);
}

/**
 * The device's preferred language (`navigator.language`). "en" on the server and during hydration,
 * so the server-rendered markup always matches; React re-renders with the real value right after.
 */
export function useLocale(): string {
  return useSyncExternalStore(subscribe, () => navigator.language, () => "en");
}
