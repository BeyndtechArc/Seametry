package basket

import (
	"fmt"
	"math/big"

	"github.com/BeyndtechArc/Seametry/internal/amount"
)

// ClaimOne is the index a leg starts at: 1.0 in 64 bit fixed point.
//
// It is 2^64 because the Rust program stores amounts as u64. Multiplying a u64
// by an index no larger than 2^64 stays inside u128, so no intermediate can
// overflow on chain.
var ClaimOne = new(big.Int).Lsh(big.NewInt(1), 64)

// Claim is one owner's entitlement to one constituent after melting.
//
// Units are fixed quantities until a seizure, and then they shrink in the same
// proportion as the leg's Unclaimed balance. Doing that by touching every claim
// is impossible on chain, so the leg keeps a ClaimIndex that only falls and each
// claim remembers the index it was last settled against. Settling scales Units
// by the ratio of the two.
type Claim struct {
	Units amount.Amount
	// Index is the leg's ClaimIndex when Units were last settled. Meaningless,
	// and nil, while Units is zero.
	Index *big.Int
	// Epoch is the leg's ClaimEpoch at that time.
	Epoch uint64
}

// NewClaim returns an empty claim at the given scale.
func NewClaim(scale int32) (Claim, error) {
	zero, err := amount.Zero(scale)
	if err != nil {
		return Claim{}, err
	}
	return Claim{Units: zero}, nil
}

func (c Constituent) claimIndex() *big.Int {
	if c.ClaimIndex == nil {
		return ClaimOne
	}
	return c.ClaimIndex
}

// shrinkClaims records that Unclaimed fell from before to its current value.
//
// Every claim is worth the same fraction of what it was, so the index falls by
// that fraction, rounded down. Rounding down never pays a claimant more than
// their share, and the difference stays in Unclaimed where the Hall keeps it.
//
// When nothing is left, or the fraction is too small for the index to hold, the
// leg starts a new epoch. Claims from an older epoch settle to zero, and claims
// made afterwards start again from ClaimOne.
func shrinkClaims(c Constituent, before amount.Amount) (Constituent, error) {
	if c.Unclaimed.Equal(before) {
		return c, nil
	}
	if c.Unclaimed.IsZero() {
		return startNewEpoch(c), nil
	}
	index := new(big.Int).Mul(c.claimIndex(), c.Unclaimed.Atoms())
	index.Quo(index, before.Atoms())
	if index.Sign() == 0 {
		return startNewEpoch(c), nil
	}
	c.ClaimIndex = index
	return c, nil
}

func startNewEpoch(c Constituent) Constituent {
	c.ClaimEpoch++
	c.ClaimIndex = new(big.Int).Set(ClaimOne)
	return c
}

// Settle brings a claim up to date with every seizure since it was last touched.
func Settle(claim Claim, c Constituent) (Claim, error) {
	if claim.Units.IsZero() {
		return rebase(claim, c), nil
	}
	if claim.Index == nil || claim.Index.Sign() <= 0 {
		return Claim{}, fmt.Errorf("basket: %s: a claim of %s has no index to settle against", c.Mint, claim.Units)
	}
	if claim.Epoch > c.ClaimEpoch {
		return Claim{}, fmt.Errorf("basket: %s: claim epoch %d is ahead of the leg's %d", c.Mint, claim.Epoch, c.ClaimEpoch)
	}
	if claim.Epoch < c.ClaimEpoch {
		zero, err := amount.Zero(claim.Units.Scale())
		if err != nil {
			return Claim{}, err
		}
		claim.Units = zero
		return rebase(claim, c), nil
	}
	if claim.Index.Cmp(c.claimIndex()) < 0 {
		return Claim{}, fmt.Errorf("basket: %s: claim index %s is below the leg's %s, and the index only falls",
			c.Mint, claim.Index, c.claimIndex())
	}
	units, err := claim.Units.MulDiv(c.claimIndex(), claim.Index, amount.RoundFloor)
	if err != nil {
		return Claim{}, err
	}
	claim.Units = units
	return rebase(claim, c), nil
}

func rebase(claim Claim, c Constituent) Claim {
	claim.Index = new(big.Int).Set(c.claimIndex())
	claim.Epoch = c.ClaimEpoch
	return claim
}

// CreditClaim adds units to a claim after a melt moved them from the ledger to
// Unclaimed. The claim is settled first, so units credited now are not scaled
// by seizures that happened before they existed.
func CreditClaim(claim Claim, c Constituent, units amount.Amount) (Claim, error) {
	settled, err := Settle(claim, c)
	if err != nil {
		return Claim{}, err
	}
	settled.Units, err = settled.Units.Add(units)
	return settled, err
}

// WithdrawClaim delivers units of a claim, reducing the leg's Unclaimed.
func WithdrawClaim(claim Claim, c *Constituent, units amount.Amount) (Claim, error) {
	settled, err := Settle(claim, *c)
	if err != nil {
		return Claim{}, err
	}
	cmp, err := units.Cmp(settled.Units)
	if err != nil {
		return Claim{}, err
	}
	if cmp > 0 {
		return Claim{}, fmt.Errorf("basket: %s: withdrawal of %s exceeds the claim of %s", c.Mint, units, settled.Units)
	}
	if err := Withdraw(c, units); err != nil {
		return Claim{}, err
	}
	settled.Units, err = settled.Units.Sub(units)
	return settled, err
}
