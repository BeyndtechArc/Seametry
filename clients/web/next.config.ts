import type { NextConfig } from "next";

// Security headers, including the Content-Security-Policy, are set in
// proxy.ts, not here: every route in this app is dynamically rendered (see
// src/app/page.tsx), so a per-request nonce is available, and setting the
// same header names in both places would mean two Content-Security-Policy
// headers on one response, which browsers enforce as their intersection
// rather than as one overriding the other.
const nextConfig: NextConfig = {
  experimental: {
    sri: {
      algorithm: "sha256",
    },
  },
};

export default nextConfig;
