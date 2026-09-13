# Demo and Submission Script

## Core claim

> A tokenized stock can remain executable on Solana while its issuer state, external market observations and public representations disagree. Seametry shows that seam before the user signs and records exactly what was approved.

## 90-second product demo

### 0–12 seconds — Establish the reproduced problem

Open the UNHx replay on the native app.

Say:

> At this dividend boundary, the issuer reported a halt and no reference quote, while a Jupiter-mediated Solana trade still settled. Wallets and explorers also displayed different supply representations.

Show the synchronized timeline and source timestamps.

### 12–28 seconds — Explain Seametry

Move to the normal live asset.

Say:

> Seametry joins three things that trading interfaces usually separate: what the instrument is, what independent sources currently observe, and what your exact amount can execute for.

Show xStocks, Chainlink, Stork and the route as distinct labelled rows.

### 28–52 seconds — Preflight

Enter a small USDC amount.

Show:

- route venues and split;
- expected and minimum output;
- impact and fee lines;
- source age and divergence;
- deterministic `ALLOW`, `WARN`, or `BLOCK` reasons.

Say:

> We do not invent a consensus price or recommend a trade. Every value keeps its source, timestamp and meaning.

### 52–72 seconds — Explicit approval and signing

Open the approval sheet and acknowledge any active factual warning. Tap `Open wallet to sign`, approve in the wallet, and return to Seametry.

Say:

> The user holds the keys. Seametry requotes, simulates and enforces the displayed minimum before handing the transaction to the wallet.

### 72–90 seconds — Receipt and retention

Show the settled receipt and then Today with a state-change notification.

Say:

> The receipt preserves what the user saw and what actually settled. Watchlists, source changes, corporate actions and receipts make this a repeat mobile product rather than a one-time diagnostic.

## Public proof console

The public URL must expose:

- product statement and install QR;
- live source-health matrix;
- UNHx replay;
- normal control;
- one public redacted receipt;
- Solscan transaction link;
- repository and release links;
- `Live / Fixture-backed / Unavailable / Planned` matrix;
- claims and limitations.

## Submission description

**Problem:** Tokenized-stock users can see a tradable ticker without seeing whether issuer state, oracle observations and executable liquidity agree.

**Product:** Seametry is a native mobile app that synchronizes instrument identity, xStocks issuer state, Chainlink and Stork observations, and Jupiter Metis execution before a self-custodial wallet signs.

**Solana necessity:** Permissionless Solana pools can remain live through offchain market closures and issuer discontinuities. Seametry reads Token-2022 state, inspects Solana routes, simulates the transaction and verifies settlement onchain.

**Proof:** A reproduced UNHx corporate-action case, a normal control, an installable app, and one real mainnet receipt.

## Evidence checklist

- [ ] Raw xStocks responses captured with UTC timestamps.
- [ ] Chainlink stream ID, schema and verification result captured.
- [ ] Stork asset ID, aggregation method and verification result captured.
- [ ] Jupiter `/build` response with route plan captured.
- [ ] Solana mint extensions and parsed/raw balances captured.
- [ ] Wallet approval recorded without exposing sensitive session data.
- [ ] Mainnet signature links publicly.
- [ ] Receipt proves actual output met the approved minimum.
- [ ] Fixture checksums committed.
- [ ] App build links to exact commit SHA.
- [ ] All third-party SDKs and visual assets attributed.

## Judge objections and answers

**“Is this just another price aggregator?”**  
No. A price aggregator normally collapses sources into one value. Seametry preserves issuer state, independent observations and executable quotes as different objects, then validates the proposed transaction.

**“Why not use Jupiter directly?”**  
Jupiter finds execution. It does not define the token's rights, interpret issuer corporate-action policy, compare independent RWA observations, or retain a preflight-to-settlement receipt.

**“Why is this mobile?”**  
The recurring job happens through state changes and wallet actions. Native notifications bring a user to the affected instrument, secure local state preserves receipts, and app-to-wallet handoff completes the trade where users already monitor markets.

**“Why both Chainlink and Stork?”**  
The product is about source boundaries. Two independently signed observation systems let Seametry show support, timestamp, methodology, verification and disagreement rather than treating one provider as unquestioned truth.

**“Does ALLOW mean safe?”**  
No. It means a published set of mechanical validity checks passed. Market, counterparty, legal and suitability risks remain.

