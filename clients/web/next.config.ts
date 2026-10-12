import type { NextConfig } from "next";
import { createMDX } from "fumadocs-mdx/next";

// Security headers, including the Content-Security-Policy, are set in
// proxy.ts, not here: every route in this app is dynamically rendered (see
// src/app/page.tsx), so a per-request nonce is available, and setting the
// same header names in both places would mean two Content-Security-Policy
// headers on one response, which browsers enforce as their intersection
// rather than as one overriding the other.
const nextConfig: NextConfig = {
  devIndicators: false,
  // The product moved into the App shell at /app on 30 September 2026. Links
  // already shared keep working. Temporary (307), not permanent: a 308 is
  // cached by browsers for good, and this layout is days old.
  redirects() {
    return [
      { source: "/allocation", destination: "/app/allocation", permanent: false },
      // The clickable Hall demo was retired on 8 October 2026; links to it
      // land on the live register, where Strike and Melt run on real Alloys.
      { source: "/hall-demo", destination: "/app/alloys", permanent: false },
      { source: "/app/hall", destination: "/app/alloys", permanent: false },
      { source: "/terminal", destination: "/app/instruments", permanent: false },
      { source: "/terminal/instruments/:mint", destination: "/app/instruments/:mint", permanent: false },
      { source: "/terminal/alloys", destination: "/app/alloys", permanent: false },
      { source: "/terminal/alloys/:address", destination: "/app/alloys/:address", permanent: false },
      // The explanation pages moved into the docs on 12 October 2026
      // (.plan/docs-site.plan.md). Temporary until Storm's read-through, for
      // the same reason as above.
      { source: "/how-it-works", destination: "/docs/how-it-works", permanent: false },
      { source: "/the-key", destination: "/docs/the-key", permanent: false },
      { source: "/papers/the-exit", destination: "/docs/papers/the-exit", permanent: false },
    ];
  },
  experimental: {
    sri: {
      algorithm: "sha256",
    },
  },
};

// Compiles the MDX under content/docs at build time (.plan/docs-site.plan.md).
// Only the content pipeline comes from Fumadocs; every element on a docs page
// is drawn by @seametry/ui, because a packaged docs theme writes inline style
// attributes the nonce policy in proxy.ts refuses.
export default createMDX()(nextConfig);
