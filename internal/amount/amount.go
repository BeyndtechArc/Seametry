// Package amount carries every quantity of money, token, fee, multiplier and
// ratio in Seametry.
//
// An amount is an integer count of atoms plus an explicit scale, and its value
// is atoms / 10^scale. The pair always travels together, because atoms without
// a scale is not a small number, it is a meaningless one.
//
// There is no floating point anywhere in this package and no way to get a
// float in or out. That is the whole reason it exists: a binary float cannot
// represent most decimal fractions, so a price that survives one arithmetic
// step intact can be wrong after three, and the error appears in settlement
// rather than in a test.
//
// Rounding is never implicit. Every operation that can lose precision takes a
// Rounding, and RoundExact refuses rather than silently discarding a
// remainder. The Hall uses RoundCeil for required inputs and RoundFloor for
// outputs so that every rounding favours the protocol rather than the caller.
//
// Amounts are immutable. Every operation returns a new value and no method
// mutates its receiver.
//
// Bound by spec/amount/vectors.json, which also binds the Rust program,
// because recipe arithmetic in the Hall is this same MulDiv with this same
// rounding and a one atom disagreement is a basket that does not balance.
package amount

import (
	"encoding/json"
	"fmt"
	"math/big"
	"strings"
)

// MaxScale bounds how many decimal places an amount may carry. Token-2022
// mints top out well below this; the headroom is for derived ratios.
const MaxScale = 38

// Rounding selects what happens when an operation leaves a remainder.
type Rounding uint8

const (
	// RoundExact refuses any operation that would leave a remainder. It is the
	// right choice wherever losing a fraction of an atom would be a defect
	// rather than a rounding.
	RoundExact Rounding = iota
	// RoundDown rounds toward zero.
	RoundDown
	// RoundUp rounds away from zero.
	RoundUp
	// RoundFloor rounds toward negative infinity.
	RoundFloor
	// RoundCeil rounds toward positive infinity.
	RoundCeil
)

func (r Rounding) String() string {
	switch r {
	case RoundExact:
		return "exact"
	case RoundDown:
		return "down"
	case RoundUp:
		return "up"
	case RoundFloor:
		return "floor"
	case RoundCeil:
		return "ceil"
	}
	return fmt.Sprintf("Rounding(%d)", uint8(r))
}

// ParseRounding reads the mode names used in spec/amount/vectors.json.
func ParseRounding(s string) (Rounding, error) {
	switch s {
	case "exact":
		return RoundExact, nil
	case "down":
		return RoundDown, nil
	case "up":
		return RoundUp, nil
	case "floor":
		return RoundFloor, nil
	case "ceil":
		return RoundCeil, nil
	}
	return 0, fmt.Errorf("amount: unknown rounding mode %q", s)
}

// Amount is an exact decimal: atoms / 10^scale.
//
// The zero value is a valid zero at scale 0.
type Amount struct {
	atoms *big.Int // nil means zero; never mutated after construction
	scale int32
}

// Zero returns zero at the given scale.
func Zero(scale int32) (Amount, error) {
	if err := checkScale(scale); err != nil {
		return Amount{}, err
	}
	return Amount{atoms: new(big.Int), scale: scale}, nil
}

// FromBig builds an amount from a count of atoms. The input is copied, so the
// caller may continue to use it.
func FromBig(atoms *big.Int, scale int32) (Amount, error) {
	if err := checkScale(scale); err != nil {
		return Amount{}, err
	}
	if atoms == nil {
		return Amount{}, fmt.Errorf("amount: atoms is nil")
	}
	return Amount{atoms: new(big.Int).Set(atoms), scale: scale}, nil
}

// FromInt64 builds an amount from a count of atoms.
func FromInt64(atoms int64, scale int32) (Amount, error) {
	if err := checkScale(scale); err != nil {
		return Amount{}, err
	}
	return Amount{atoms: big.NewInt(atoms), scale: scale}, nil
}

// ParseAtoms reads a base 10 integer count of atoms, which is how atoms arrive
// on the wire and in fixtures.
func ParseAtoms(atoms string, scale int32) (Amount, error) {
	if err := checkScale(scale); err != nil {
		return Amount{}, err
	}
	n, ok := new(big.Int).SetString(atoms, 10)
	if !ok {
		return Amount{}, fmt.Errorf("amount: %q is not a base 10 integer", atoms)
	}
	return Amount{atoms: n, scale: scale}, nil
}

// ParseDecimal reads a plain decimal string and infers the scale from the
// digits after the point, so "1.50" is 150 atoms at scale 2 and keeps its
// stated precision rather than being normalized to 1.5.
//
// Exponent notation is refused. Magnitude is carried by the scale, and
// accepting "1e5" would mean accepting a notation whose parsing differs
// between languages.
func ParseDecimal(s string) (Amount, error) {
	if s == "" {
		return Amount{}, fmt.Errorf("amount: empty decimal")
	}
	body := s
	negative := false
	if strings.HasPrefix(body, "-") {
		negative = true
		body = body[1:]
	}
	if body == "" {
		return Amount{}, fmt.Errorf("amount: %q has no digits", s)
	}

	intPart, fracPart := body, ""
	if i := strings.IndexByte(body, '.'); i >= 0 {
		intPart, fracPart = body[:i], body[i+1:]
		if strings.IndexByte(fracPart, '.') >= 0 {
			return Amount{}, fmt.Errorf("amount: %q has more than one decimal point", s)
		}
	}
	if intPart == "" && fracPart == "" {
		return Amount{}, fmt.Errorf("amount: %q has no digits", s)
	}
	if !allDigits(intPart) || !allDigits(fracPart) {
		return Amount{}, fmt.Errorf("amount: %q is not a plain decimal; "+
			"exponents, separators and signs other than a leading minus are not accepted", s)
	}

	scale := int32(len(fracPart))
	if err := checkScale(scale); err != nil {
		return Amount{}, err
	}

	digits := intPart + fracPart
	n, ok := new(big.Int).SetString(digits, 10)
	if !ok {
		return Amount{}, fmt.Errorf("amount: %q is not a plain decimal", s)
	}
	if negative {
		n.Neg(n)
	}
	return Amount{atoms: n, scale: scale}, nil
}

// MustParseDecimal is ParseDecimal for constants and tests. It panics on a
// malformed input, so never hand it a runtime value.
func MustParseDecimal(s string) Amount {
	a, err := ParseDecimal(s)
	if err != nil {
		panic(err)
	}
	return a
}

// Atoms returns a copy of the atom count.
func (a Amount) Atoms() *big.Int {
	if a.atoms == nil {
		return new(big.Int)
	}
	return new(big.Int).Set(a.atoms)
}

// Scale returns the number of decimal places.
func (a Amount) Scale() int32 { return a.scale }

// AtomsString renders the atom count in base 10.
func (a Amount) AtomsString() string {
	if a.atoms == nil {
		return "0"
	}
	return a.atoms.String()
}

// Sign reports -1, 0 or +1.
func (a Amount) Sign() int {
	if a.atoms == nil {
		return 0
	}
	return a.atoms.Sign()
}

// IsZero reports whether the amount is exactly zero.
func (a Amount) IsZero() bool { return a.Sign() == 0 }

// Neg returns the amount with its sign reversed.
func (a Amount) Neg() Amount {
	return Amount{atoms: new(big.Int).Neg(a.big()), scale: a.scale}
}

// String renders the exact decimal value, always with `scale` digits after the
// point, so the precision an amount claims is visible in its own rendering.
func (a Amount) String() string {
	n := a.big()
	negative := n.Sign() < 0
	digits := new(big.Int).Abs(n).String()
	if a.scale == 0 {
		if negative {
			return "-" + digits
		}
		return digits
	}
	for int32(len(digits)) <= a.scale {
		digits = "0" + digits
	}
	cut := int32(len(digits)) - a.scale
	out := digits[:cut] + "." + digits[cut:]
	if negative {
		return "-" + out
	}
	return out
}

// Rescale converts to a different scale.
//
// Increasing the scale is lossless and ignores the rounding mode. Decreasing
// it discards digits, so the mode decides what happens to them, and RoundExact
// refuses when any discarded digit is non zero.
func (a Amount) Rescale(target int32, mode Rounding) (Amount, error) {
	if err := checkScale(target); err != nil {
		return Amount{}, err
	}
	switch {
	case target == a.scale:
		return Amount{atoms: new(big.Int).Set(a.big()), scale: target}, nil
	case target > a.scale:
		factor := pow10(target - a.scale)
		return Amount{atoms: new(big.Int).Mul(a.big(), factor), scale: target}, nil
	default:
		q, err := divRound(a.big(), pow10(a.scale-target), mode)
		if err != nil {
			return Amount{}, fmt.Errorf("amount: rescale %s from scale %d to %d: %w", a, a.scale, target, err)
		}
		return Amount{atoms: q, scale: target}, nil
	}
}

// Add returns a + b, at the finer of the two scales so that nothing is lost.
//
// This package cannot tell one unit from another. Adding USDC to a share count
// is arithmetically fine and economically nonsense, and preventing it is the
// job of the types that carry an instrument alongside their amount.
func (a Amount) Add(b Amount) (Amount, error) { return a.combine(b, false) }

// Sub returns a - b, at the finer of the two scales.
func (a Amount) Sub(b Amount) (Amount, error) { return a.combine(b, true) }

func (a Amount) combine(b Amount, subtract bool) (Amount, error) {
	scale := a.scale
	if b.scale > scale {
		scale = b.scale
	}
	// Both conversions increase the scale, so both are lossless and the
	// rounding mode is never consulted.
	x, err := a.Rescale(scale, RoundExact)
	if err != nil {
		return Amount{}, err
	}
	y, err := b.Rescale(scale, RoundExact)
	if err != nil {
		return Amount{}, err
	}
	out := new(big.Int)
	if subtract {
		out.Sub(x.big(), y.big())
	} else {
		out.Add(x.big(), y.big())
	}
	return Amount{atoms: out, scale: scale}, nil
}

// Cmp compares two amounts by value, ignoring any difference in scale, so that
// 1.50 and 1.5 compare equal.
func (a Amount) Cmp(b Amount) (int, error) {
	scale := a.scale
	if b.scale > scale {
		scale = b.scale
	}
	x, err := a.Rescale(scale, RoundExact)
	if err != nil {
		return 0, err
	}
	y, err := b.Rescale(scale, RoundExact)
	if err != nil {
		return 0, err
	}
	return x.big().Cmp(y.big()), nil
}

// Equal reports whether two amounts have the same value, ignoring scale.
func (a Amount) Equal(b Amount) bool {
	c, err := a.Cmp(b)
	return err == nil && c == 0
}

// MulDiv returns atoms * mul / div at the same scale, rounded as directed.
//
// This is the operation the Hall's recipe arithmetic is built from:
//
//	required_in(i, n) = ceil ( n * ledger[i] / supply )   favours the protocol
//	out(i, n)         = floor( n * ledger[i] / supply )   favours the protocol
//
// The intermediate product is exact and unbounded, so a value that would
// overflow a u128 midway through still produces the arithmetically correct
// result rather than wrapping.
func (a Amount) MulDiv(mul, div *big.Int, mode Rounding) (Amount, error) {
	if mul == nil || div == nil {
		return Amount{}, fmt.Errorf("amount: MulDiv requires non nil operands")
	}
	if div.Sign() == 0 {
		return Amount{}, fmt.Errorf("amount: MulDiv by zero")
	}
	product := new(big.Int).Mul(a.big(), mul)
	q, err := divRound(product, div, mode)
	if err != nil {
		return Amount{}, fmt.Errorf("amount: MulDiv %s * %s / %s: %w", a, mul, div, err)
	}
	return Amount{atoms: q, scale: a.scale}, nil
}

// wire is the JSON shape. Atoms are a string because they routinely exceed the
// range a JSON number carries exactly, and a silently rounded amount on the
// wire is the exact defect this package exists to prevent.
type wire struct {
	Atoms string `json:"atoms"`
	Scale int32  `json:"scale"`
}

// MarshalJSON renders {"atoms":"...","scale":N}.
func (a Amount) MarshalJSON() ([]byte, error) {
	return json.Marshal(wire{Atoms: a.AtomsString(), Scale: a.scale})
}

// UnmarshalJSON reads {"atoms":"...","scale":N}. A JSON number for atoms is
// refused, because by the time it reaches here it may already have been
// rounded by the parser.
func (a *Amount) UnmarshalJSON(data []byte) error {
	var w wire
	dec := json.NewDecoder(strings.NewReader(string(data)))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&w); err != nil {
		return fmt.Errorf("amount: %w", err)
	}
	parsed, err := ParseAtoms(w.Atoms, w.Scale)
	if err != nil {
		return err
	}
	*a = parsed
	return nil
}

// big returns the atom count, substituting zero for the zero value. The result
// is only ever read, or copied before being written.
func (a Amount) big() *big.Int {
	if a.atoms == nil {
		return new(big.Int)
	}
	return a.atoms
}

func checkScale(scale int32) error {
	if scale < 0 {
		return fmt.Errorf("amount: scale %d is negative", scale)
	}
	if scale > MaxScale {
		return fmt.Errorf("amount: scale %d exceeds the maximum of %d", scale, MaxScale)
	}
	return nil
}

func allDigits(s string) bool {
	for i := 0; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			return false
		}
	}
	return true
}

func pow10(n int32) *big.Int {
	return new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(n)), nil)
}

// divRound divides with the requested rounding.
//
// big.Int.QuoRem truncates toward zero and gives the remainder the sign of the
// dividend, which matches JavaScript's BigInt division. That correspondence is
// what lets one generator produce vectors both implementations satisfy.
func divRound(num, den *big.Int, mode Rounding) (*big.Int, error) {
	q, r := new(big.Int).QuoRem(num, den, new(big.Int))
	if r.Sign() == 0 {
		return q, nil
	}
	negative := (num.Sign() < 0) != (den.Sign() < 0)
	one := big.NewInt(1)
	switch mode {
	case RoundExact:
		return nil, fmt.Errorf("division leaves remainder %s under exact rounding", r)
	case RoundDown:
		return q, nil
	case RoundUp:
		if negative {
			return q.Sub(q, one), nil
		}
		return q.Add(q, one), nil
	case RoundFloor:
		if negative {
			return q.Sub(q, one), nil
		}
		return q, nil
	case RoundCeil:
		if negative {
			return q, nil
		}
		return q.Add(q, one), nil
	}
	return nil, fmt.Errorf("amount: unknown rounding mode %d", uint8(mode))
}
