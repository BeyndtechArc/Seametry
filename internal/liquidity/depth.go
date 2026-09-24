package liquidity

import (
	"context"
	"fmt"
	"math/big"
	"sort"

	"github.com/BeyndtechArc/Seametry/internal/amount"
)

// Point is one size on a depth curve.
type Point struct {
	Size        amount.Amount
	Observation Observation

	// ShortfallBps is how much worse the realised rate at this size is than the
	// rate at the reference size, in basis points rounded up. It is nil when
	// there is no quote here or no reference to compare against.
	ShortfallBps *int64
}

// Curve is the executable depth of one instrument, smallest size first.
type Curve struct {
	Points []Point
	// Reference is the index of the smallest size that returned a quote, which
	// every shortfall is measured against. It is -1 when no size did.
	Reference int
}

// Sample prices an instrument at each size, in order, and builds its curve.
//
// Sizes are sorted ascending first, because the shortfall of a size is defined
// against the smallest one that priced, and a curve whose reference depends on
// the order the caller happened to list sizes in would not be reproducible.
func (c *Client) Sample(ctx context.Context, base Request, sizes []amount.Amount) (Curve, error) {
	ordered, err := sortSizes(sizes)
	if err != nil {
		return Curve{}, err
	}

	points := make([]Point, 0, len(ordered))
	for _, size := range ordered {
		req := base
		req.Amount = size
		observation, err := c.Observe(ctx, req)
		if err != nil {
			return Curve{}, err
		}
		points = append(points, Point{Size: size, Observation: observation})
	}
	return BuildCurve(points)
}

// BuildCurve computes shortfalls for points already ordered smallest first.
func BuildCurve(points []Point) (Curve, error) {
	curve := Curve{Points: points, Reference: -1}
	for i, p := range points {
		if p.Observation.Availability == Available {
			curve.Reference = i
			break
		}
	}
	if curve.Reference < 0 {
		return curve, nil
	}

	reference := points[curve.Reference].Observation.Quote
	for i := range curve.Points {
		q := curve.Points[i].Observation.Quote
		if q == nil {
			continue
		}
		shortfall, err := Shortfall(reference, q)
		if err != nil {
			return Curve{}, fmt.Errorf("liquidity: size %s: %w", curve.Points[i].Size, err)
		}
		curve.Points[i].ShortfallBps = &shortfall
	}
	return curve, nil
}

// Shortfall is how much worse quote's rate is than reference's, in basis
// points, rounded up.
//
//	10000 * (refOut * qIn - qOut * refIn) / (refOut * qIn)
//
// which is 10000 * (1 - rate_q / rate_ref) without ever forming a rate, so
// nothing is divided until the end and nothing passes through a float. Rounding
// up overstates the shortfall, which is the conservative direction for a figure
// that gates admission. A negative result means the larger size got a better
// rate, which routing across more venues can produce, and it is reported as is.
func Shortfall(reference, q *Quote) (int64, error) {
	refIn, refOut := reference.In.Atoms(), reference.Out.Atoms()
	qIn, qOut := q.In.Atoms(), q.Out.Atoms()

	denominator := new(big.Int).Mul(refOut, qIn)
	if denominator.Sign() <= 0 {
		return 0, fmt.Errorf("a reference output of %s cannot anchor a comparison", reference.Out)
	}

	numerator := new(big.Int).Sub(new(big.Int).Mul(refOut, qIn), new(big.Int).Mul(qOut, refIn))
	numerator.Mul(numerator, big.NewInt(10000))

	scaled, err := amount.FromBig(numerator, 0)
	if err != nil {
		return 0, err
	}
	bps, err := scaled.MulDiv(big.NewInt(1), denominator, amount.RoundCeil)
	if err != nil {
		return 0, err
	}
	if !bps.Atoms().IsInt64() {
		return 0, fmt.Errorf("shortfall is out of range")
	}
	return bps.Atoms().Int64(), nil
}

func sortSizes(sizes []amount.Amount) ([]amount.Amount, error) {
	ordered := append([]amount.Amount(nil), sizes...)
	var failure error
	sort.SliceStable(ordered, func(i, j int) bool {
		cmp, err := ordered[i].Cmp(ordered[j])
		if err != nil && failure == nil {
			failure = err
		}
		return cmp < 0
	})
	return ordered, failure
}
