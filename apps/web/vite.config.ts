import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  // Serve dev on 3000 so it matches WEBAUTHN_ORIGIN / WEBAUTHN_RP_ID for local passkeys.
  server: {
    port: 3000,
    strictPort: true,
  },
  resolve: {
    tsconfigPaths: true,
  },
  // The ledger workspace package ships TypeScript source (no build step), so bundle it into the
  // SSR output instead of leaving it as an external runtime import.
  ssr: {
    noExternal: ["@splitfree/ledger"],
  },
  // Pre-bundle client deps at startup. Without this, Vite discovers them lazily on first navigation
  // to a route that uses them and re-optimizes mid-session, which 504s the in-flight chunk
  // ("Outdated Optimize Dep") and leaves the page un-hydrated (dead buttons/dropdowns).
  optimizeDeps: {
    include: [
      "@simplewebauthn/browser",
      "radix-ui",
      "lucide-react",
      "class-variance-authority",
      "clsx",
      "tailwind-merge",
      "sonner",
      "next-themes",
    ],
  },
});
