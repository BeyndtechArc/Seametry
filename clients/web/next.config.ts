import type { NextConfig } from "next";

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
      { source: "/hall-demo", destination: "/app/hall", permanent: false },
      { source: "/terminal", destination: "/app/instruments", permanent: false },
      { source: "/terminal/instruments/:mint", destination: "/app/instruments/:mint", permanent: false },
      { source: "/terminal/alloys", destination: "/app/alloys", permanent: false },
      { source: "/terminal/alloys/:address", destination: "/app/alloys/:address", permanent: false },
    ];
  },
  experimental: {
    sri: {
      algorithm: "sha256",
    },
  },
};

export default nextConfig;
