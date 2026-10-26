import { useEffect, useState } from "react";
import { Toaster } from "~/components/ui/sonner";

/**
 * Toasts sit at the bottom-center on mobile and bottom-right on desktop (≥ sm). SSR defaults to the
 * desktop position; the effect corrects it on mount and on resize.
 */
export function AppToaster() {
  const [position, setPosition] = useState<"bottom-center" | "bottom-right">("bottom-right");

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const update = () => setPosition(mq.matches ? "bottom-right" : "bottom-center");
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return <Toaster richColors position={position} />;
}
