# Depth at size is a policy input, and what was assumed to get there

**Decision record. Historical, append only, not a living document.**
Recorded 24 September 2026.

The living authority for the service is `../SERVICE_CATALOG.md` section 3.4,
and for the rules `../ENGINEERING_STANDARD.md`.

---

## Context

The admission standard needs an answer to "can this instrument actually be
traded at a size that matters", and until now it had none. Good Delivery
requires that an executable quote exists at the reference size within a price
impact ceiling, and `internal/policy` could not evaluate that rule.

## What was measured

Seven live xStocks instruments, priced in USDC at 100, 1,000 and 10,000, on
24 September 2026. Raw responses are stored unmodified in `fixtures/jupiter/`
and the report is `../../evidence/depth-2026-09-24.md`.

- **Three of seven had no usable route at all.** CATx returned `NO_ROUTES_FOUND`.
  CRDAx returned `TOKEN_NOT_TRADABLE`. PALLx returned both, at different sizes,
  within the same run.
- **Depth varied by three orders of magnitude.** AAPLx lost 12 basis points at
  1,000 USDC and 36 at 10,000. NFLXx lost 232 at 1,000 and 1,664 at 10,000.
  STRKx lost 8,237 basis points at 1,000 USDC, which is 82 percent, and routes
  through a single order book venue.
- **Six of seven are refused by the shipped policy.** Only AAPLx is admitted,
  with warnings for its issuer powers.

## Decisions

**D1. A refusal is an observation, not an error.** No route and not tradable
describe the instrument. They are recorded per size with the provider's own
code, and an unrecognised code is kept verbatim instead of being mapped to a
known one. The same instrument gave two different reasons in one run, so the
reason is recorded per point and never summarised per instrument.

**D2. Shortfall is computed, not quoted.** It is measured between two stored
quotes in exact arithmetic, rounded up, against the smallest size that priced,
and the baseline size travels with it. Jupiter's own price impact field is kept
as a stated figure but does not decide anything.

**D3. Depth measured at the wrong size is not observed.** A shortfall at 100
USDC says nothing about 1,000, so depth at any size other than the policy's
reference size produces `DEPTH_NOT_OBSERVED` and a warning, never a pass.

**D4. The policy version bumps when its inputs change.** A decision now depends
on depth, so it carries `policy-2026.09.2`.

## Measured, not assumed

- **`priceImpactPct` is a fraction, not a percent.** At 100,000 USDC into AAPLx
  the realised shortfall was 2.11 percent while the field read 0.0205. Reading it
  as a percent would understate impact a hundredfold. It is also absent at
  very small sizes, which is not the same as zero.
- **Jupiter allows about ten requests per ten seconds** on a free key, visible
  in the `x-ratelimit-*` response headers. A token bucket sends at most
  burst + rate x window requests, so the client is configured at 0.7 a second
  with a burst of two, and a test asserts the inequality. The first draft used
  0.9 and eight, which permits seventeen, and was refused on its first live run.

## Assumptions, stated rather than hidden

These are choices, not findings. Each is recorded in the code beside the value.

- **The ceiling of 100 basis points at 1,000 USDC.** Chosen as a round figure
  that admits the one deep instrument and refuses anything losing more than two
  percent. Nothing validates it as the right level for a basket. Revisit with
  evidence about what constituent depth an alloy needs. It is policy data, so
  changing it is a version bump and no code change.
- **A quote expires 15 seconds after receipt.** Jupiter states no expiry, so
  this is our own policy, chosen short because a route executable moments ago
  may not be now.
- **Whether Jupiter's rate limit window is fixed or sliding is not
  established.** The defaults sit under both readings.
- **Buying only.** Depth selling into USDC was not measured and can differ
  sharply on a thin pool.
- **One aggregator, one moment.** Three samples taken seconds apart.

## Toolchain

The Solana CLI (4.3.0) and Anchor (1.2.0) installed natively on Windows with
Rust 1.98.1, although the documentation says WSL is required. That the tools
install is verified. That an Anchor program builds and its tests run here is
not yet verified and is the first thing the Hall's program work must establish.
