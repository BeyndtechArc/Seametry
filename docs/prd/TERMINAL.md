> **Living document. Owns:** requirements for the Terminal, the creation and redemption console.
> **Does not own:** product scope and positioning, which `../PRODUCT_ARCHITECTURE.md` owns, or the arithmetic the console displays, which `BASKET_DOMAIN.md` and `HALL.md` own. The Terminal computes nothing itself.
> **Phase 2.** It ships as the formula and depth workbench. Real creation and redemption on mainnet wait for phase 3.

# Terminal

The authorized participant's console. An open authorized participant set is worth nothing without tooling that makes being one practical, and no such tooling exists for on chain baskets. The Terminal is that tooling. It is a professional surface and deliberately not a retail broker.

---

## 1. Who and for what

Market makers, arbitrageurs, analysts and treasury teams. Each has the same question: what would it cost to assemble this basket, what would it return if melted, and how does that compare with what its share trades for.

## 2. What it shows

Each item names the service that produces it. The Terminal renders a result and the inputs and policy version behind it, and never derives one.

| View | Answers | Produced by |
|---|---|---|
| Admissibility per constituent | May this instrument enter a formula, and on what reasons | Registry, Policy |
| Depth at size | What buying a constituent costs beyond its smallest priced size, as a curve, with the age of each quote | Liquidity |
| Cost to assemble | What a strike of n shares takes, per constituent, rounded up | Basket |
| Melt proceeds | What a melt of n shares returns, per constituent, rounded down, and what the Hall keeps | Basket |
| NAV against share price | The gap, with the source and age of every price behind it | Basket, Market State |
| Held back legs | Which constituents an issuer currently prevents delivering, and the claim that waits | Hall state, Registry |
| Receipts | Every action's receipt and whether it verifies | Receipt and Audit |

## 3. What exists today

- The cost to assemble and melt proceeds arithmetic, computed by `internal/basket` and shown for a demonstration alloy on the Explorer's Hall page, checked against the compiled program.
- Admissibility decisions and depth at size, computed by `internal/policy` and `internal/liquidity` and shown for seven captured instruments on the Explorer.
- The Hall program, with all five instructions tested in a simulator. It is not deployed.

Nothing here is interactive. There is no input for a formula, no live quote, and no wallet connection.

## 4. What does not exist

- **NAV against share price.** It needs prices, and the Hall reads none. Oracle values are to be read from chain (`../decisions/2026-09-23-oracles-on-chain.md`) and that read is not built.
- **A share price.** No share pool exists, so there is nothing to compare against. Seeding one is a phase 3 activity and needs capital.
- **Execution.** Signing, transaction construction, transfer hook accounts, and the lookup table a large basket needs.
- **Depth for selling.** Depth is measured for buying only.

## 5. Rules that apply here

- Every number carries its source, its age and its evidence state, in the same place.
- No figure is described as true, correct, fair or safe. No direction, size or timing is recommended.
- Amounts are integers with a stated scale. A price impact is shown as a whole number of basis points, computed by the core.
- A constituent an issuer holds back is shown as held back, with the reason, and never as a smaller number.
- A quote past its lifetime is shown as expired with its age, and cannot be acted on.

## 6. Open questions

- Whether the workbench is a web application or part of the mobile app. The architecture says professional, which points at a desktop web surface, and nothing decides it.
- Which market data the first version uses to show a share price, given that oracle reads are not built and no share pool exists.
- Whether a formula can be saved, and where. A saved formula is stored user data, and decision D9 in `../decisions/2026-09-23-etf-spine.md` makes storage the cost driver on a free tier.
