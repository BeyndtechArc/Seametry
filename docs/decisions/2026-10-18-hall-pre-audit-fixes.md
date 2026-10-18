# The Hall's pre-audit review, and what it changed

**Date:** 18 October 2026

## Decision

Before the Vaultline audit, Seametry reviewed the Hall program itself, every
instruction and the arithmetic, and fixed what it found: a transfer hook's
extra accounts are now carried on every deposit and delivery, a strike that
would deposit nothing is refused, and a small credit can no longer postpone
credit that is already vesting. The spec in `docs/prd/HALL.md` now says what
the code does, including where it does not yet have a test.

## In plain words

The Hall holds tokenized stocks and gives out shares. Three things could have
gone wrong.

**1. A switched-on "transfer hook" would have locked people's tokens in.**
Some stock tokens carry a hook: a rule their issuer can switch on, so every
transfer of that token has to pass an extra check run by the issuer's program.
xStocks mints carry one that is installed but switched off. For the check to
run, every transfer has to bring along a few extra accounts the issuer's
program needs. The Hall never brought them. So if an issuer switched its hook
on, every transfer of that stock out of the Hall would have failed. People who
melted their shares would have been owed that stock and never able to collect
it, and once the program's upgrade key is given up, nobody could have fixed it.
Our own spec said this was handled and tested; it was neither.
*Example:* you melt 10 shares and are owed 0.004 TSLAx. The issuer switches its
hook on. Every attempt to collect your TSLAx fails, forever.
*Now:* the Hall brings the extra accounts on every deposit and every delivery.
A test switches a real hook on and proves deposits and deliveries go through,
and that if the hook says no, your TSLAx simply waits as a claim, as a freeze
does, while melting still works.

**2. Free shares after a total seizure.**
To make new shares you deposit each stock in proportion to what the Hall
holds. If an issuer took back every stock the Hall held, the Hall would hold
zero of everything, and "in proportion to zero" is zero: anyone could make any
number of shares for nothing. If the issuer later returned the tokens, those
free shares would take a cut of what came back, at the expense of the people
whose stock had been taken.
*Example:* the Hall holds nothing after a seizure; someone mints a million
shares for free; the issuer returns the stock; the free shares claim most of it.
*Now:* making shares that cost nothing is refused.

**3. A one-atom donation could keep pushing back everyone's credit.**
When tokens arrive in the Hall, for example a dividend paid in new tokens, they
are released to holders gradually over an hour, so nobody can pump the share
value in an instant. But any new arrival restarted the hour for everything
still waiting. Someone could send one atom every few minutes and keep restarting
it, so credit already on its way kept being delayed. Nothing was stolen; it was
a nuisance that slowed holders' credit down.
*Now:* a new arrival only moves the release time in proportion to its size. One
atom moves it by about a second; a big dividend gets nearly the full hour. The
protection against pumping the share value is unchanged.

## What was done, in the code

- **Hooks.** `chain/programs/hall/src/instructions/transfer.rs` builds Token-2022's
  `transfer_checked` and, for a mint whose hook names a program, appends the
  hook's accounts with `spl_transfer_hook_interface::onchain::add_extra_accounts_for_execute_cpi`.
  Anchor's `transfer_checked` passes exactly four accounts and ignores any
  others, so it could not have been fixed by passing more. Callers send hook
  accounts after the per-constituent accounts of `initialize_alloy` and
  `create`, and as `withdraw`'s remaining accounts. `chain/programs/hall-test-hook`
  is a test-only hook (never deployed) that needs one account found only through
  its extra account list and refuses while that account's first byte is not 1.
  `tests/hooks.rs` has three tests; with the forwarding disabled all three fail,
  each for the reason it names.
- **Free strike.** `recipe::create_inputs` and Go's `basket.Create` refuse when
  every required input is zero (`HallError::NothingToDeposit`).
- **Vest end.** On a credit, the vest ends at
  `now + ceil((r * d + s * W) / (r + s))`, `r` the remainder with `d` seconds
  left and `s` the credit, in Rust and in Go. By Cauchy-Schwarz the vesting rate
  rises by at most `s / W`, the bound vesting the credit alone would give.
- **Vectors.** Two scenarios were added to `shared/spec/recipe/vectors.json` by
  `go test ./server/internal/basket -update`; no existing step changed, because
  no existing scenario credited during a running vest or struck against zero
  ledgers. Each new scenario fails, in both Go and Rust, against the old rule.

## Rejected

- **Ignoring small surpluses** instead of weighting the vest end. A surplus
  must go somewhere to keep `balance == ledger + pending + unclaimed`, and
  folding it in without moving the end would let small credits vest at once,
  reopening the instant-inflation path the vest exists to close.
- **Refusing a strike whenever any one ledger is zero.** A leg seized to zero
  while others hold value is priced correctly by the existing arithmetic; only
  the all-zero case mints for nothing.

## Cost

The program changed, so the audit scope's figures changed with it:
`chain/AUDIT_SCOPE.md` was regenerated and the submitted application must be
edited to match before the audit starts. The program gained one dependency,
`spl-transfer-hook-interface` 2.1.0, Solana's own. A caller of `create` or
`withdraw` on a hooked mint must now send that hook's accounts. Still open, and
stated in the spec: the twelve-constituent bound has no test, because a legacy
transaction cannot carry twelve constituents.
