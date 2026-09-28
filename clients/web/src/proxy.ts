import { NextRequest, NextResponse } from "next/server";

// This app (the Terminal and the business pages) was never going to be
// static: wallet connections, signed-in state and live data all need a
// request in hand. So there is no static-generation benefit to trade away by
// choosing a strict script-src here, unlike the Explorer, which stays its
// own separately deployed static site precisely so it can keep one
// (docs/decisions/2026-09-27-web-app-and-payments.md). A fresh nonce per
// request, with no 'unsafe-inline', is what Next's own CSP guide recommends
// for exactly this shape of app.
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    `font-src 'self'`,
    `img-src 'self' data:`,
    // One named devnet RPC origin, for /hall-demo's direct @solana/web3.js
    // Connection calls. Not a wallet-adapter requirement: a Wallet Standard
    // extension talks to the page through an injected object, which CSP
    // never restricts. Devnet only, matching "never imply mainnet";
    // widening this to any Solana cluster, let alone any origin, would be
    // the loosening the task's own instructions say to stop and ask about.
    `connect-src 'self' https://api.devnet.solana.com`,
    `object-src 'none'`,
    `base-uri 'none'`,
    `frame-ancestors 'none'`,
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
