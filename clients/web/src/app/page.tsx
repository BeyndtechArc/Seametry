import { connection } from "next/server";

// A placeholder, not a page: Phase 4 scaffolds the shell, the tokens, the
// fonts, the security headers and CI. Every real page (docs/prd/SITE.md,
// docs/prd/TERMINAL.md) is Phase 6, built to the design skill's templates,
// not written here first.
//
// await connection() opts this route into dynamic rendering, which the CSP
// nonce in proxy.ts requires: a nonce baked into a statically prerendered
// page is the same value on every request, which is not a nonce. Every real
// page joins this same requirement.
export default async function Home() {
  await connection();
  return null;
}
