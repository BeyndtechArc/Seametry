# Account authority runs beside the Gateway

**Date:** 9 October 2026

## Decision

Run Better Auth as a dedicated Node process on the Oracle host. Give it a
separate database and restricted login in the existing private PostgreSQL
container. Route its public contract through Caddy. Keep thin Vercel proxy
routes at `/api/auth/*` and `/api/account/*` so browser sessions remain
first-party.

## Why this changed

The first account implementation placed the Better Auth authority inside the
Next.js deployment and required a PostgreSQL address reachable from Vercel.
The existing Oracle PostgreSQL instance is intentionally reachable only on the
Docker network. Publishing its port would weaken that boundary, while adding a
second managed database would divide identity and operational ownership before
the product needs that separation.

The separate process preserves the service boundary already named in the
catalog. It also gives Seametry one place to add wallet evidence, account
deletion, retention and the later signed subject contract consumed by Go.

## Cost

The Oracle host now runs one Node process in addition to Go, Caddy and
PostgreSQL. Deployments must build that image and complete two migration steps
before auth starts. Vercel remains in the request path as a transport proxy for
first-party cookies, so account sign-in depends on both deployments.

## Rejected paths

- Publishing PostgreSQL port 5432 for Vercel. This adds a public database
  boundary and a TLS and firewall burden for no product capability.
- Adding Neon only for account records. This is operationally small, but it
  creates a second database owner while the existing host has enough capacity
  for the current account cut.
- Sending browsers directly to `api.seametry.xyz`. Safari may treat those
  cookies as third-party in some deployments, and the product already has a
  first-party route available.
