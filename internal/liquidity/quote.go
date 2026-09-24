// Package liquidity answers what would actually happen at a given size.
//
// A quote is not a price. It is an expiring proposition for one instrument,
// one direction and one size, and it is treated as such: it carries the slot it
// was observed at, and it is refused once past its expiry by every consumer.
//
// The absence of a quote is also an observation. A route that does not exist,
// or a token the aggregator will not trade, is a fact about the instrument and
// is recorded with the provider's own code rather than folded into an error or
// a zero. In a survey of seven live xStocks mints, three had no usable route,
// for two different reasons.
package liquidity

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/BeyndtechArc/Seametry/internal/amount"
)

// The quote asset every depth is measured in.
const (
	USDCMint     = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
	USDCDecimals = 6
)

// WholeUSDC returns a whole number of USDC as an amount.
func WholeUSDC(n int64) (amount.Amount, error) {
	return amount.FromInt64(n*1_000_000, USDCDecimals)
}

// Availability says whether a quote exists, and if not, why.
type Availability string

const (
	// Available means a route was found and priced.
	Available Availability = "available"
	// NoRoute means the aggregator found no path at this size.
	NoRoute Availability = "no_route"
	// NotTradable means the aggregator will not trade the token at all.
	NotTradable Availability = "not_tradable"
	// Unrecognised means the provider refused with a code this build does not
	// know. The code is kept verbatim on the observation, and it is never
	// mapped to one of the others: an unknown reason is a fact in its own right.
	Unrecognised Availability = "unrecognised"
)

// Provider error codes, exactly as Jupiter spells them.
const (
	codeNoRoutes    = "NO_ROUTES_FOUND"
	codeNotTradable = "TOKEN_NOT_TRADABLE"
)

// Hop is one leg of a route.
type Hop struct {
	Venue   string `json:"venue"`
	Pool    string `json:"pool"`
	Percent int    `json:"percent"`
}

// Quote is an expiring executable proposition.
type Quote struct {
	InputMint  string
	OutputMint string

	In     amount.Amount
	Out    amount.Amount
	MinOut amount.Amount

	SlippageBps int
	Hops        []Hop

	// StatedImpactBps is the aggregator's own price impact figure, in basis
	// points rounded up. It is nil when the aggregator did not state one, which
	// happens at very small sizes and is not the same as zero impact.
	StatedImpactBps *int64

	ContextSlot uint64
	ReceivedAt  time.Time
	ExpiresAt   time.Time

	RawSHA256 string
}

// ErrExpired is returned when a quote is used past its expiry.
type ErrExpired struct {
	ExpiresAt time.Time
	AsOf      time.Time
}

func (e *ErrExpired) Error() string {
	return fmt.Sprintf("liquidity: quote expired at %s, now %s; request a fresh one",
		e.ExpiresAt.Format(time.RFC3339), e.AsOf.Format(time.RFC3339))
}

// Require returns an error unless the quote is still live at asOf.
//
// Every consumer calls this rather than reading ExpiresAt itself, so that an
// expired quote cannot be reused by one that forgot to check. The expiry is our
// own policy: aggregators state none, and a route that was executable a minute
// ago may not be now.
func (q Quote) Require(asOf time.Time) error {
	if !asOf.Before(q.ExpiresAt) {
		return &ErrExpired{ExpiresAt: q.ExpiresAt, AsOf: asOf}
	}
	return nil
}

// Request is what to price.
type Request struct {
	InputMint      string
	OutputMint     string
	InputDecimals  int32
	OutputDecimals int32
	Amount         amount.Amount
	SlippageBps    int
}

// Observation is what was learned from one request, whether or not a quote
// came back.
type Observation struct {
	Request      Request
	Availability Availability
	// Code is the provider's error code when no quote exists, kept verbatim.
	Code       string
	Quote      *Quote
	ReceivedAt time.Time
	// Status and Raw are the response exactly as received, so the observation
	// can be re-derived from bytes the provider actually sent.
	Status    int
	Raw       []byte
	RawSHA256 string
}

func digest(raw []byte) string {
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:])
}
