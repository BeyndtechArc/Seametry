// Package basket implements the Hall's arithmetic: what a strike costs, what a
// melt returns, and how the ledger reconciles with a balance an issuer moved.
//
// It is the conformance surface between two implementations. The Rust program
// performs the same arithmetic on chain and is bound to this package by
// spec/recipe/vectors.json, which both test suites load. A one unit
// disagreement is a basket that does not balance, so the vectors are the
// specification and neither implementation is.
//
// Nothing here reads a price. Strike and melt move quantities, which is what
// makes minting immune to price manipulation and keeps the Hall working when
// every price source is down. Nothing here reads the clock either: vesting
// takes the instant to evaluate at as an argument.
//
// Every rounding favours the protocol. Required inputs round up, outputs round
// down, and the gap between them stays with the Hall rather than the caller.
package basket

import (
	"fmt"
	"math/big"
	"time"

	"github.com/BeyndtechArc/Seametry/internal/amount"
)

// Constituent is one instrument's position inside an alloy.
//
// The invariant that defines it, checked after every operation:
//
//	actual balance == Ledger + Pending + Unclaimed
//
// Ledger is what backs outstanding shares. Pending is credited but not yet
// vested. Unclaimed is owed to holders who have melted but not withdrawn.
type Constituent struct {
	Mint string

	Ledger    amount.Amount
	Pending   amount.Amount
	Unclaimed amount.Amount

	// VestStart is when the current Pending balance began vesting. A new
	// credit restarts it, which is what stops a donor timing a deposit to land
	// just before their own strike.
	VestStart time.Time

	// ClaimIndex and ClaimEpoch record how far a seizure has shrunk every
	// outstanding claim. See claim.go. A nil ClaimIndex means no seizure has
	// touched Unclaimed, which is ClaimOne.
	ClaimIndex *big.Int
	ClaimEpoch uint64
}

// Expected is the balance the Hall believes it holds.
func (c Constituent) Expected() (amount.Amount, error) {
	sum, err := c.Ledger.Add(c.Pending)
	if err != nil {
		return amount.Amount{}, err
	}
	return sum.Add(c.Unclaimed)
}

// Alloy is a basket instance.
type Alloy struct {
	// Supply is the share count, a plain integer rather than an Amount because
	// shares have no scale: one share is one share.
	Supply       *big.Int
	Constituents []Constituent
}

func (a *Alloy) supply() *big.Int {
	if a.Supply == nil {
		return new(big.Int)
	}
	return a.Supply
}

// RequiredIn is what a caller must deposit of one constituent to mint n shares.
//
//	ceil( n * ledger / supply )
//
// Rounding up is what stops a caller acquiring a fraction of a unit for free,
// repeated across many small strikes.
func RequiredIn(c Constituent, shares, supply *big.Int) (amount.Amount, error) {
	if supply.Sign() == 0 {
		return amount.Amount{}, fmt.Errorf("basket: required input is undefined at zero supply; use Initialize")
	}
	return c.Ledger.MulDiv(shares, supply, amount.RoundCeil)
}

// Out is what burning n shares returns of one constituent.
//
//	floor( n * ledger / supply )
//
// Rounding down leaves any fraction with the Hall, which is the same direction
// as RequiredIn and for the same reason.
func Out(c Constituent, shares, supply *big.Int) (amount.Amount, error) {
	if supply.Sign() == 0 {
		return amount.Amount{}, fmt.Errorf("basket: output is undefined at zero supply")
	}
	return c.Ledger.MulDiv(shares, supply, amount.RoundFloor)
}

// Vested reports how much of Pending has vested by asOf, over window.
//
// Linear, and clamped at both ends. A donation cannot raise share value in a
// single block, which is the defence against the inflation attack that the
// Venus exploit used: donated assets there lifted a vault's share price
// immediately and the profit was taken through liquidations in the same
// transaction.
func Vested(c Constituent, asOf time.Time, window time.Duration) (amount.Amount, error) {
	if c.Pending.IsZero() {
		return amount.Zero(c.Pending.Scale())
	}
	if window <= 0 {
		return c.Pending, nil
	}

	elapsed := asOf.Sub(c.VestStart)
	if elapsed <= 0 {
		return amount.Zero(c.Pending.Scale())
	}
	if elapsed >= window {
		return c.Pending, nil
	}

	return c.Pending.MulDiv(
		big.NewInt(int64(elapsed)),
		big.NewInt(int64(window)),
		amount.RoundFloor,
	)
}

// SyncKind names what a sync found.
type SyncKind string

const (
	// SyncUnchanged means the actual balance matched what the Hall expected.
	SyncUnchanged SyncKind = "unchanged"
	// SyncCredit means the balance rose. A dividend paid in new tokens, or a
	// donation. Which one it was is the ledger's job to classify, from whether
	// the increase traces to the issuer's mint authority.
	SyncCredit SyncKind = "credit"
	// SyncDeficit means the balance fell. An issuer took tokens using its
	// permanent delegate, and holders bear it pro rata.
	SyncDeficit SyncKind = "deficit"
)

// SyncResult is what one reconciliation did.
type SyncResult struct {
	Kind SyncKind
	// Delta is the difference found, always positive; Kind carries the sign.
	Delta amount.Amount
	// VestedIn is how much previously pending balance folded into the ledger.
	VestedIn amount.Amount
	// After is the constituent's state once the sync is applied.
	After Constituent
}

// Sync reconciles one constituent against the balance actually held.
//
// Order matters and is specified: vested pending folds into the ledger first,
// then the difference is applied. A surplus becomes pending and restarts the
// vest. A deficit consumes unvested pending first, and only what remains falls
// pro rata on the ledger and on unclaimed, so holders and claimants share a
// seizure in proportion rather than one group absorbing it.
func Sync(c Constituent, actual amount.Amount, asOf time.Time, window time.Duration) (SyncResult, error) {
	vested, err := Vested(c, asOf, window)
	if err != nil {
		return SyncResult{}, fmt.Errorf("basket: %s: vesting: %w", c.Mint, err)
	}

	after := c
	if after.Ledger, err = c.Ledger.Add(vested); err != nil {
		return SyncResult{}, err
	}
	if after.Pending, err = c.Pending.Sub(vested); err != nil {
		return SyncResult{}, err
	}

	expected, err := after.Expected()
	if err != nil {
		return SyncResult{}, err
	}
	cmp, err := actual.Cmp(expected)
	if err != nil {
		return SyncResult{}, err
	}

	result := SyncResult{VestedIn: vested, After: after}
	switch {
	case cmp == 0:
		result.Kind = SyncUnchanged
		if result.Delta, err = amount.Zero(actual.Scale()); err != nil {
			return SyncResult{}, err
		}
		return result, nil

	case cmp > 0:
		surplus, err := actual.Sub(expected)
		if err != nil {
			return SyncResult{}, err
		}
		result.Kind = SyncCredit
		result.Delta = surplus
		// The whole pending balance vests together, so a new credit restarts
		// the window for what was already there. That is deliberate: it is the
		// conservative direction, and it removes any benefit from timing a
		// deposit against an existing vest.
		if result.After.Pending, err = result.After.Pending.Add(surplus); err != nil {
			return SyncResult{}, err
		}
		result.After.VestStart = asOf
		return result, nil

	default:
		deficit, err := expected.Sub(actual)
		if err != nil {
			return SyncResult{}, err
		}
		result.Kind = SyncDeficit
		result.Delta = deficit
		if result.After, err = applyDeficit(result.After, deficit); err != nil {
			return SyncResult{}, err
		}
		return result, nil
	}
}

// applyDeficit takes a loss from pending first, then splits what remains
// between ledger and unclaimed in proportion to their sizes.
//
// The ledger absorbs any rounding remainder rather than unclaimed, because a
// claimant's entitlement is a fixed quantity already owed to a named party,
// while the ledger is shared across every holder.
func applyDeficit(c Constituent, deficit amount.Amount) (Constituent, error) {
	fromPending, err := minAmount(c.Pending, deficit)
	if err != nil {
		return c, err
	}
	if c.Pending, err = c.Pending.Sub(fromPending); err != nil {
		return c, err
	}
	remaining, err := deficit.Sub(fromPending)
	if err != nil {
		return c, err
	}
	if remaining.IsZero() {
		return c, nil
	}

	base, err := c.Ledger.Add(c.Unclaimed)
	if err != nil {
		return c, err
	}
	if base.IsZero() {
		return c, fmt.Errorf("basket: %s: deficit of %s exceeds everything the Hall holds", c.Mint, remaining)
	}

	// Unclaimed rounds down, so the ledger carries the remainder.
	fromUnclaimed, err := remaining.MulDiv(c.Unclaimed.Atoms(), base.Atoms(), amount.RoundFloor)
	if err != nil {
		return c, err
	}
	if cmp, err := fromUnclaimed.Cmp(c.Unclaimed); err != nil {
		return c, err
	} else if cmp > 0 {
		fromUnclaimed = c.Unclaimed
	}
	fromLedger, err := remaining.Sub(fromUnclaimed)
	if err != nil {
		return c, err
	}

	if cmp, err := fromLedger.Cmp(c.Ledger); err != nil {
		return c, err
	} else if cmp > 0 {
		return c, fmt.Errorf("basket: %s: deficit of %s exceeds the ledger", c.Mint, remaining)
	}

	if c.Ledger, err = c.Ledger.Sub(fromLedger); err != nil {
		return c, err
	}
	unclaimedBefore := c.Unclaimed
	if c.Unclaimed, err = c.Unclaimed.Sub(fromUnclaimed); err != nil {
		return c, err
	}
	return shrinkClaims(c, unclaimedBefore)
}

// Create computes the deposits required to mint shares, refusing if any exceeds
// the caller's stated maximum.
//
// The caller names a share count and its limits, never an amount. A depositor
// therefore cannot be rounded down to zero shares, which is the mechanism of
// the classic vault inflation attack.
func Create(a *Alloy, shares *big.Int, maximums []amount.Amount) ([]amount.Amount, error) {
	if shares == nil || shares.Sign() <= 0 {
		return nil, fmt.Errorf("basket: share count must be positive")
	}
	if len(maximums) != len(a.Constituents) {
		return nil, fmt.Errorf("basket: %d maximums for %d constituents", len(maximums), len(a.Constituents))
	}
	supply := a.supply()
	if supply.Sign() == 0 {
		return nil, fmt.Errorf("basket: cannot strike into an uninitialized alloy")
	}

	inputs := make([]amount.Amount, len(a.Constituents))
	for i, c := range a.Constituents {
		required, err := RequiredIn(c, shares, supply)
		if err != nil {
			return nil, err
		}
		cmp, err := required.Cmp(maximums[i])
		if err != nil {
			return nil, err
		}
		if cmp > 0 {
			return nil, fmt.Errorf("basket: %s needs %s, above the stated maximum of %s",
				c.Mint, required, maximums[i])
		}
		inputs[i] = required
	}
	return inputs, nil
}

// Redeem computes what burning shares credits to a claim, one leg per
// constituent.
//
// It touches no constituent program. That is what makes melting impossible for
// an issuer to block: burning shares and crediting a claim are entirely
// internal, and only delivering a leg later can be frozen, paused or hooked.
func Redeem(a *Alloy, shares *big.Int) ([]amount.Amount, error) {
	if shares == nil || shares.Sign() <= 0 {
		return nil, fmt.Errorf("basket: share count must be positive")
	}
	supply := a.supply()
	if shares.Cmp(supply) > 0 {
		return nil, fmt.Errorf("basket: cannot melt %s shares against a supply of %s", shares, supply)
	}

	legs := make([]amount.Amount, len(a.Constituents))
	for i, c := range a.Constituents {
		out, err := Out(c, shares, supply)
		if err != nil {
			return nil, err
		}
		legs[i] = out
	}
	return legs, nil
}

// ApplyRedeem moves redeemed units from the ledger into unclaimed and burns the
// shares. Held separate from Redeem so a caller can price a melt without
// performing one.
func ApplyRedeem(a *Alloy, shares *big.Int, legs []amount.Amount) error {
	if len(legs) != len(a.Constituents) {
		return fmt.Errorf("basket: %d legs for %d constituents", len(legs), len(a.Constituents))
	}
	for i := range a.Constituents {
		ledger, err := a.Constituents[i].Ledger.Sub(legs[i])
		if err != nil {
			return err
		}
		if ledger.Sign() < 0 {
			return fmt.Errorf("basket: %s: melt would take more than the ledger holds", a.Constituents[i].Mint)
		}
		unclaimed, err := a.Constituents[i].Unclaimed.Add(legs[i])
		if err != nil {
			return err
		}
		a.Constituents[i].Ledger = ledger
		a.Constituents[i].Unclaimed = unclaimed
	}
	a.Supply = new(big.Int).Sub(a.supply(), shares)
	return nil
}

// ApplyCreate adds deposited units to the ledger and mints the shares.
func ApplyCreate(a *Alloy, shares *big.Int, inputs []amount.Amount) error {
	if len(inputs) != len(a.Constituents) {
		return fmt.Errorf("basket: %d inputs for %d constituents", len(inputs), len(a.Constituents))
	}
	for i := range a.Constituents {
		ledger, err := a.Constituents[i].Ledger.Add(inputs[i])
		if err != nil {
			return err
		}
		a.Constituents[i].Ledger = ledger
	}
	a.Supply = new(big.Int).Add(a.supply(), shares)
	return nil
}

// Withdraw delivers one leg of a claim, reducing unclaimed.
func Withdraw(c *Constituent, units amount.Amount) error {
	cmp, err := units.Cmp(c.Unclaimed)
	if err != nil {
		return err
	}
	if cmp > 0 {
		return fmt.Errorf("basket: %s: withdrawal of %s exceeds the %s owed", c.Mint, units, c.Unclaimed)
	}
	c.Unclaimed, err = c.Unclaimed.Sub(units)
	return err
}

func minAmount(a, b amount.Amount) (amount.Amount, error) {
	cmp, err := a.Cmp(b)
	if err != nil {
		return amount.Amount{}, err
	}
	if cmp <= 0 {
		return a, nil
	}
	return b, nil
}
