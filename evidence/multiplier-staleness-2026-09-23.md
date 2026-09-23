# What 1026 tokenized equities actually carry

**Captured 23 September 2026 from Solana mainnet, slot 449582227.**
Machine readable: `multiplier-staleness-2026-09-23.json`.

Reproduce it, without credentials and without asking us for anything:

```bash
go run ./tools/survey
```

Every number below is decoded from mint account bytes by `internal/registry`,
not read from any issuer's published list. A published list is evidence of
intent at the time it was written. The account is what is true now.

## Issuer powers

Every one of the 1026 mints carries all three of these.

| Power | Mints | Share |
|---|---|---|
| Can take this back from any wallet (permanent delegate) | 1026 | 100% |
| Can freeze this where it sits (freeze authority) | 1026 | 100% |
| Can switch on a check of who may receive this (transfer hook, present and disabled) | 1026 | 100% |
| Currently checking who may receive (transfer hook active) | 0 | 0% |
| New accounts start frozen (default account state) | 0 | 0% |
| Halted by the issuer right now | 7 | 0.7% |
| Paused on chain right now | 0 | 0% |

The transfer hook row is the one worth sitting with. Not a single mint has an
active hook, so a product that reports hooks as a boolean would say "no hook"
across the board and be wrong about all 1026. The hook exists on every one of
them, switched off, with a named authority who can switch it on at any moment
and without any other change to the mint. Reporting that as absent is not a
simplification, it is a different fact.

## The multiplier field

| | Mints |
|---|---|
| Carrying Scaled UI Amount | 1026 |
| **Where the field named `multiplier` is stale** | **385 (37.5%)** |
| Activation scheduled but not yet effective | 1 |

Scaled UI Amount carries `multiplier`, `new_multiplier`, and
`new_multiplier_effective_timestamp`. The live value is `new_multiplier` once
its timestamp has passed, otherwise `multiplier`. Anything that reads the
obvious field is one corporate action behind on more than a third of this
market.

This independently reproduces the figure the project's earlier research cited,
370 of 927, on a larger and more current sample.

### It is not a rounding error

| Symbol | The obvious field says | The live value is | Effective since |
|---|---|---|---|
| NFLXx | 1.0 | **10.0** | 16 Nov 2025 |
| PPLTx | 1.0 | **10.0** | 17 May 2026 |
| PALLx | 1.0 | **5.0** | 17 May 2026 |
| CRWDx | 1.0 | **4.0** | 2 Jul 2026 |

Four splits, at ten, ten, five and four for one, where the obvious field still
reads its initial value. Anyone pricing a position in NFLXx from that field
values it at a tenth of what it is. NFLXx has been in that state since
November 2025.

The rest are smaller and more insidious. AAPLx is one action behind rather than
many, and the difference is under a tenth of a percent. That is still a real
mispricing on every share, and a system that only caught the dramatic cases
would pass NFLXx and fail silently here.

The JSON records both values at full precision:

```
"naive_value": "1.002664207589379685714447987265884876251220703125"
"live_value":  "1.0032690125398187053207266217214055359363555908203125"
```

Those long tails are not noise and not a display bug. Token-2022 stores the
multiplier as a float64, and those digits are what the float actually holds.
Seametry converts it to its exact decimal once, at the boundary, and computes
in exact decimal after that, so the tail is preserved rather than rounded to
the shorter number a float printer would show.

### The opposite error

One mint, TQQQx, had an activation scheduled but not yet effective at capture.
Returning `new_multiplier` before its timestamp is exactly as wrong as
returning the stale field after it, and only a mint in this state can catch
that. It is in the fixture set for that reason, resolved against a fixed
reference time so the case survives the activation landing.

## Decoder coverage

| | |
|---|---|
| Mints decoded | 1026 of 1026 |
| Decode failures | 0 |
| Extensions encountered that this build does not recognise | 0 |

The last row is reported because it is the one that will change. When an issuer
adopts an extension Seametry has not implemented, it appears here by number
rather than being dropped, and it reaches the interface as a sentence saying
there is a control we do not yet decode. An unknown that is silently discarded
is indistinguishable from an absent one at every layer above, which is how a
new issuer power becomes invisible.

## What this does not establish

- **Only one issuer.** xStocks mints only. Backpack Securities is not covered,
  and its dividend mechanism, a multiplier change or newly minted tokens,
  remains an open question that a fixture capture will settle.
- **A moment, not a trend.** One slot. The staleness share moves as issuers
  update fields, and the four large splits above will eventually be cleaned up.
- **Nothing about intent.** An issuer holding a power is not an issuer misusing
  one. Every issuer holding a given power gets the identical sentence in this
  product. The point is that holders cannot currently see the powers at all.
- **Nothing about depth.** Whether any of these can actually be traded at size
  is a separate measurement and a separate ceiling.
