# Route-observation operation

**Owner:** web Allocation research adapter  
**Recorded:** 11 October 2026  
**No mainnet transactions are sent by this collector.**

## What exists

The current Basket chart is a normalized series of read-only **Jupiter exact-input quotes**. The collector requests 25 USDC to each presently admitted token mint. It keeps the returned token amount (in raw atoms), mint decimals, observed Solana context slot, route venues, issuer and admission digest.

This measures the indicative **cost of acquiring tokenized representations onchain**, including the route conditions at that moment. It does not measure the underlying company's official stock price or an Alloy share's market price.

The series uses the first date on which every basket constituent was sampled as a base of 100. It then compares the price of the original equal-dollar raw token positions through later daily quotes, without rebalancing or filling missing data.

**No quote becomes a signed execution instruction.** User trades still call the separate fresh-quote, simulation, country-gated Approval path.

## What needs configuring

The sampler uses `JUPITER_API_KEY`, which Allocations already require.

For persistent cross-deployment history, configure an HTTP-compatible Redis provider (e.g. Upstash's free Redis plan). Set only on the server:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `CRON_SECRET` — a new cryptographically random bearer secret

No Pyth, Chainlink, Stork, equity subscription or wallet private key is required.

The collector returns 503 without those variables and never falls back to an unguarded public collector. Values must not be committed, printed in logs or prefixed `NEXT_PUBLIC_`.

## Schedule

Root `vercel.json` schedules `GET /api/market/observe` at `00:20 UTC`, once per day. The server requires `Authorization: Bearer CRON_SECRET`.

Each daily run:
1. obtains a short-lived storage lock;
2. reads the current admissions snapshot;
3. sequentially requests quotes only for admitted mints whose policy capacity covers the 25 USDC sample;
4. persists successful observations and refusals separately (refusals are not price points);
5. marks the UTC day complete only after successful persistence.

Routes that are missing, 429, malformed or illiquid are omissions, not zero-valued prices. The daily lock avoids overlapping jobs; it expires after one hour if a run fails before completion.

The REST history store keeps about 90 days of raw observations using sorted-set timestamps. The Baskets API currently displays only the recent 30-day window, and only dates complete for the queried basket.

Jupiter's free organization-wide quota remains a constraint. A full sampling pass can take tens of seconds because `jupiter.ts` deliberately paces calls. The collector must never be triggered by public card impressions.

## Expected states

- **Storage not configured:** public Basket rows load, chart says 'No routed history yet'.
- **First daily observation:** still no curve; a single point does not establish performance.
- **Two complete UTC dates:** chart can show a sourced quote-index change.
- **Any constituent missing:** that day's basket point is excluded; no interpolation.
- **Stale data:** latest sampled day is visible; never silently claim it is today's price.
- **Current purchase:** user gets a separate, fresh simulation regardless of historical chart state.

Basket details and the methodology describe this as **routed acquisition history**, not NAV, exchange price, audited P&L or a guaranteed exit.

## Limitations

The record currently samples only the **buy** side at one small standard notional. It cannot measure exit proceeds or fallback depth after removing the dominant venue. Those require distinct USDC-return quotes, multiple notional sizes and additional evidence labeling. Do not score venue resilience or profitability from this v1 series.

A Token-2022 multiplier, transfer restriction or issuer freeze can cause the raw-unit acquisition series to differ sharply from conventional share-price returns. Good Delivery admission remains a separate judgment.

## Smoke test (after secrets are configured)

From an authorized terminal, call the private endpoint with the deployment's own CRON_SECRET bearer value. Confirm a JSON response containing attempted/recorded counts. Do not paste the secret into issue comments, test snapshots or a public browser address.

Then inspect `/api/market/index-history?id=prime-seven`. It should initially report unavailable, and eventually return points only once every Prime Seven mint was captured on two matching days.

The public URL `/app/baskets` should work even if collection is not configured.
