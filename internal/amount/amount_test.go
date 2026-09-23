package amount

import (
	"encoding/json"
	"fmt"
	"math"
	"math/big"
	"os"
	"path/filepath"
	"testing"
)

// vectorFile mirrors spec/amount/vectors.json, which binds this package and
// the Rust program: recipe arithmetic in the Hall is this same MulDiv with this
// same rounding. It is never edited to make this test pass.
type vectorFile struct {
	Parse []struct {
		Decimal string `json:"decimal"`
		Atoms   string `json:"atoms"`
		Scale   int32  `json:"scale"`
	} `json:"parse"`
	ParseRejects []struct {
		Decimal string `json:"decimal"`
		Reason  string `json:"reason"`
	} `json:"parse_rejects"`
	Rescale []struct {
		Atoms         string `json:"atoms"`
		Scale         int32  `json:"scale"`
		TargetScale   int32  `json:"target_scale"`
		Rounding      string `json:"rounding"`
		ExpectedAtoms string `json:"expected_atoms"`
		Error         string `json:"error"`
	} `json:"rescale"`
	MulDiv []struct {
		Atoms         string `json:"atoms"`
		Scale         int32  `json:"scale"`
		Mul           string `json:"mul"`
		Div           string `json:"div"`
		Rounding      string `json:"rounding"`
		ExpectedAtoms string `json:"expected_atoms"`
		Error         string `json:"error"`
	} `json:"mul_div"`
}

func loadVectors(t *testing.T) vectorFile {
	t.Helper()
	path := filepath.Join("..", "..", "spec", "amount", "vectors.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	var vf vectorFile
	if err := json.Unmarshal(raw, &vf); err != nil {
		t.Fatalf("parse %s: %v", path, err)
	}
	if len(vf.Parse) == 0 || len(vf.MulDiv) == 0 {
		t.Fatalf("%s is empty; run: node tools/spec/generate.mjs", path)
	}
	return vf
}

func mustBig(t *testing.T, s string) *big.Int {
	t.Helper()
	n, ok := new(big.Int).SetString(s, 10)
	if !ok {
		t.Fatalf("vector holds a malformed integer: %q", s)
	}
	return n
}

func TestVectorParse(t *testing.T) {
	for _, v := range loadVectors(t).Parse {
		t.Run(v.Decimal, func(t *testing.T) {
			got, err := ParseDecimal(v.Decimal)
			if err != nil {
				t.Fatalf("ParseDecimal(%q): %v", v.Decimal, err)
			}
			if got.AtomsString() != v.Atoms {
				t.Errorf("atoms: want %s got %s", v.Atoms, got.AtomsString())
			}
			if got.Scale() != v.Scale {
				t.Errorf("scale: want %d got %d", v.Scale, got.Scale())
			}
		})
	}
}

func TestVectorParseRejects(t *testing.T) {
	for _, v := range loadVectors(t).ParseRejects {
		t.Run(v.Decimal, func(t *testing.T) {
			if got, err := ParseDecimal(v.Decimal); err == nil {
				t.Fatalf("accepted %q, which must be refused (%s); got %s", v.Decimal, v.Reason, got)
			}
		})
	}
}

func TestVectorRescale(t *testing.T) {
	for _, v := range loadVectors(t).Rescale {
		name := fmt.Sprintf("%s@%d_to_%d_%s", v.Atoms, v.Scale, v.TargetScale, v.Rounding)
		t.Run(name, func(t *testing.T) {
			mode, err := ParseRounding(v.Rounding)
			if err != nil {
				t.Fatal(err)
			}
			a, err := ParseAtoms(v.Atoms, v.Scale)
			if err != nil {
				t.Fatal(err)
			}
			got, err := a.Rescale(v.TargetScale, mode)
			if v.Error != "" {
				if err == nil {
					t.Fatalf("expected refusal (%s), got %s", v.Error, got.AtomsString())
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got.AtomsString() != v.ExpectedAtoms {
				t.Errorf("atoms: want %s got %s", v.ExpectedAtoms, got.AtomsString())
			}
			if got.Scale() != v.TargetScale {
				t.Errorf("scale: want %d got %d", v.TargetScale, got.Scale())
			}
		})
	}
}

func TestVectorMulDiv(t *testing.T) {
	for _, v := range loadVectors(t).MulDiv {
		name := fmt.Sprintf("%s@%d_x%s_div%s_%s", v.Atoms, v.Scale, v.Mul, v.Div, v.Rounding)
		t.Run(name, func(t *testing.T) {
			mode, err := ParseRounding(v.Rounding)
			if err != nil {
				t.Fatal(err)
			}
			a, err := ParseAtoms(v.Atoms, v.Scale)
			if err != nil {
				t.Fatal(err)
			}
			got, err := a.MulDiv(mustBig(t, v.Mul), mustBig(t, v.Div), mode)
			if v.Error != "" {
				if err == nil {
					t.Fatalf("expected refusal (%s), got %s", v.Error, got.AtomsString())
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got.AtomsString() != v.ExpectedAtoms {
				t.Errorf("atoms: want %s got %s", v.ExpectedAtoms, got.AtomsString())
			}
			if got.Scale() != v.Scale {
				t.Errorf("scale must be preserved: want %d got %d", v.Scale, got.Scale())
			}
		})
	}
}

// The Hall's rounding discipline, asserted as the property it actually is:
// a required input never rounds below the exact value and an output never
// rounds above it, so every rounding favours the protocol rather than the
// caller. If this inverted, a basket would leak value on every strike.
func TestRoundingAlwaysFavoursTheProtocol(t *testing.T) {
	supply := big.NewInt(1_000_003) // prime-ish, so most divisions leave a remainder
	for _, ledger := range []int64{1, 7, 999_983, 1_000_000_007} {
		for _, shares := range []int64{1, 2, 33, 100_000} {
			held, err := FromInt64(ledger, 6)
			if err != nil {
				t.Fatal(err)
			}
			n := big.NewInt(shares)

			required, err := held.MulDiv(n, supply, RoundCeil)
			if err != nil {
				t.Fatal(err)
			}
			out, err := held.MulDiv(n, supply, RoundFloor)
			if err != nil {
				t.Fatal(err)
			}

			// exact = ledger * shares / supply, as an unrounded rational.
			num := new(big.Int).Mul(big.NewInt(ledger), n)
			exactFloor := new(big.Int).Div(num, supply)

			if required.Atoms().Cmp(exactFloor) < 0 {
				t.Errorf("required input rounded below the exact value (ledger=%d shares=%d)", ledger, shares)
			}
			if out.Atoms().Cmp(exactFloor) > 0 {
				t.Errorf("output rounded above the exact value (ledger=%d shares=%d)", ledger, shares)
			}
			if c, _ := out.Cmp(required); c > 0 {
				t.Errorf("output exceeded required input (ledger=%d shares=%d)", ledger, shares)
			}
		}
	}
}

// An intermediate product that would overflow a u128 must still produce the
// arithmetically correct result. A wrapped intermediate is the kind of defect
// that only appears at large supply and is catastrophic when it does.
func TestIntermediateProductDoesNotOverflow(t *testing.T) {
	maxU128 := new(big.Int).Sub(new(big.Int).Lsh(big.NewInt(1), 128), big.NewInt(1))
	a, err := FromBig(maxU128, 0)
	if err != nil {
		t.Fatal(err)
	}
	got, err := a.MulDiv(maxU128, big.NewInt(1), RoundExact)
	if err != nil {
		t.Fatal(err)
	}
	want := new(big.Int).Mul(maxU128, maxU128) // needs 256 bits
	if got.Atoms().Cmp(want) != 0 {
		t.Fatalf("intermediate overflowed\n  want %s\n  got  %s", want, got.AtomsString())
	}
}

func TestAddSubAlignScalesWithoutLoss(t *testing.T) {
	a := MustParseDecimal("1.5")      // 15 @ 1
	b := MustParseDecimal("0.000001") // 1 @ 6
	sum, err := a.Add(b)
	if err != nil {
		t.Fatal(err)
	}
	if sum.Scale() != 6 {
		t.Errorf("sum scale: want 6 got %d", sum.Scale())
	}
	if sum.String() != "1.500001" {
		t.Errorf("sum: want 1.500001 got %s", sum)
	}
	back, err := sum.Sub(b)
	if err != nil {
		t.Fatal(err)
	}
	if !back.Equal(a) {
		t.Errorf("add then subtract did not return the original: %s", back)
	}
}

func TestCmpIgnoresScaleButStringDoesNot(t *testing.T) {
	loose := MustParseDecimal("1.5")
	tight := MustParseDecimal("1.50")
	if !loose.Equal(tight) {
		t.Error("1.5 and 1.50 must compare equal")
	}
	// Precision is information: an amount renders the precision it claims,
	// so a price quoted to two places does not silently become one place.
	if loose.String() == tight.String() {
		t.Errorf("1.5 and 1.50 must render differently, got %s and %s", loose, tight)
	}
}

func TestStringRoundTrips(t *testing.T) {
	for _, s := range []string{"0", "1", "-1", "0.5", "1.50", "-0.001", "248.37",
		"0.000000000000000001", "123456789012345678901234567890"} {
		a := MustParseDecimal(s)
		if a.String() != s {
			t.Errorf("round trip: %q became %q", s, a.String())
		}
	}
}

func TestZeroValueIsUsableZero(t *testing.T) {
	var a Amount
	if !a.IsZero() || a.Sign() != 0 || a.AtomsString() != "0" || a.String() != "0" {
		t.Fatalf("zero value is not a usable zero: %q", a)
	}
	b, err := a.Add(MustParseDecimal("1.25"))
	if err != nil {
		t.Fatal(err)
	}
	if b.String() != "1.25" {
		t.Errorf("adding to the zero value: want 1.25 got %s", b)
	}
}

// Amounts are immutable, and the internal big.Int must never be reachable for
// mutation, or one holder of an Amount could change another's value.
func TestAmountsAreImmutable(t *testing.T) {
	seed := big.NewInt(100)
	a, err := FromBig(seed, 2)
	if err != nil {
		t.Fatal(err)
	}
	seed.SetInt64(999) // the constructor must have copied
	if a.AtomsString() != "100" {
		t.Errorf("mutating the constructor argument changed the amount: %s", a.AtomsString())
	}

	got := a.Atoms()
	got.SetInt64(777) // the accessor must return a copy
	if a.AtomsString() != "100" {
		t.Errorf("mutating the accessor result changed the amount: %s", a.AtomsString())
	}

	if _, err := a.Add(MustParseDecimal("5")); err != nil {
		t.Fatal(err)
	}
	if a.AtomsString() != "100" {
		t.Errorf("Add mutated its receiver: %s", a.AtomsString())
	}
}

func TestJSONRoundTrip(t *testing.T) {
	original := MustParseDecimal("-12345.678901234567890123")
	encoded, err := json.Marshal(original)
	if err != nil {
		t.Fatal(err)
	}
	const want = `{"atoms":"-12345678901234567890123","scale":18}`
	if string(encoded) != want {
		t.Errorf("wire form\n  want %s\n  got  %s", want, encoded)
	}
	var decoded Amount
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded.String() != original.String() || decoded.Scale() != original.Scale() {
		t.Errorf("round trip lost information: %s@%d became %s@%d",
			original, original.Scale(), decoded, decoded.Scale())
	}
}

// Atoms on the wire must be a string. A JSON number would already have passed
// through a float64 in most parsers by the time it reached us, which is the
// precise defect this package exists to prevent.
func TestJSONRefusesNumericAtoms(t *testing.T) {
	var a Amount
	if err := json.Unmarshal([]byte(`{"atoms":123,"scale":2}`), &a); err == nil {
		t.Fatal("accepted a JSON number for atoms")
	}
}

func TestScaleBounds(t *testing.T) {
	if _, err := FromInt64(1, -1); err == nil {
		t.Error("negative scale must be refused")
	}
	if _, err := FromInt64(1, MaxScale+1); err == nil {
		t.Error("scale beyond the maximum must be refused")
	}
	if _, err := FromInt64(1, MaxScale); err != nil {
		t.Errorf("scale at the maximum must be accepted: %v", err)
	}
}

func TestMulDivByZeroIsRefused(t *testing.T) {
	a := MustParseDecimal("1.00")
	if _, err := a.MulDiv(big.NewInt(1), big.NewInt(0), RoundFloor); err == nil {
		t.Fatal("division by zero was accepted")
	}
}

// RoundExact exists so that a caller can state that losing a fraction would be
// a defect rather than a rounding, and be refused instead of quietly rounded.
func TestExactRefusesOnlyWhenInexact(t *testing.T) {
	a := MustParseDecimal("1.00") // 100 @ 2
	if _, err := a.MulDiv(big.NewInt(1), big.NewInt(4), RoundExact); err != nil {
		t.Errorf("100/4 is exact and must be accepted: %v", err)
	}
	if _, err := a.MulDiv(big.NewInt(1), big.NewInt(3), RoundExact); err == nil {
		t.Error("100/3 is inexact and must be refused")
	}
}

// Every mode must agree wherever the division is exact, so a caller choosing a
// mode never changes an answer that had no remainder to begin with.
func TestModesAgreeWhenExact(t *testing.T) {
	a := MustParseDecimal("100")
	var want string
	for i, mode := range []Rounding{RoundExact, RoundDown, RoundUp, RoundFloor, RoundCeil} {
		got, err := a.MulDiv(big.NewInt(3), big.NewInt(4), mode)
		if err != nil {
			t.Fatalf("%v: %v", mode, err)
		}
		if i == 0 {
			want = got.AtomsString()
			continue
		}
		if got.AtomsString() != want {
			t.Errorf("%v disagreed on an exact division: want %s got %s", mode, want, got.AtomsString())
		}
	}
}

// Negative values are where floor and down, and ceil and up, stop being
// synonyms. Quantities are non negative, but divergences and deltas are not.
func TestNegativeRoundingDirections(t *testing.T) {
	a := MustParseDecimal("-7") // -7 / 2
	for _, c := range []struct {
		mode Rounding
		want string
	}{
		{RoundDown, "-3"},  // toward zero
		{RoundUp, "-4"},    // away from zero
		{RoundFloor, "-4"}, // toward negative infinity
		{RoundCeil, "-3"},  // toward positive infinity
	} {
		got, err := a.MulDiv(big.NewInt(1), big.NewInt(2), c.mode)
		if err != nil {
			t.Fatal(err)
		}
		if got.AtomsString() != c.want {
			t.Errorf("-7/2 %v: want %s got %s", c.mode, c.want, got.AtomsString())
		}
	}
}

// FromFloat64Exact is the one float boundary in the system, and it must be
// exact rather than pretty. 1.1 is not 1.1 in binary, and the long decimal is
// what the chain actually holds.
func TestFromFloat64ExactIsExactNotPretty(t *testing.T) {
	got, err := FromFloat64Exact(1.1)
	if err != nil {
		t.Fatal(err)
	}
	const want = "1.100000000000000088817841970012523233890533447265625"
	if got.String() != want {
		t.Errorf("1.1 must convert to what the float holds\n  want %s\n  got  %s", want, got)
	}
}

func TestFromFloat64ExactRoundTripsEveryFloat(t *testing.T) {
	for _, f := range []float64{
		0, 1, -1, 0.5, 10, 5, 1.0026642075893797, 1.0032690125398187,
		2.008976295242212, 1.0561757, 0.1, -0.1, 1e-10, 1e10,
	} {
		a, err := FromFloat64Exact(f)
		if err != nil {
			t.Fatalf("%v: %v", f, err)
		}
		// Parsing the exact decimal back and re-reading it as a float must
		// return the identical float, since the decimal lost nothing.
		back, _, err := new(big.Float).SetPrec(200).Parse(a.String(), 10)
		if err != nil {
			t.Fatalf("%v: reparse: %v", f, err)
		}
		if f64, _ := back.Float64(); f64 != f {
			t.Errorf("%v did not round trip: got %v via %s", f, f64, a)
		}
	}
}

func TestFromFloat64ExactRefusesNonFinite(t *testing.T) {
	for _, f := range []float64{math.NaN(), math.Inf(1), math.Inf(-1)} {
		if _, err := FromFloat64Exact(f); err == nil {
			t.Errorf("accepted %v", f)
		}
	}
}
