package gateway

import (
	"testing"
	"time"

	"github.com/BeyndtechArc/Seametry/server/internal/amount"
	"github.com/BeyndtechArc/Seametry/server/internal/gateway/api"
	"github.com/BeyndtechArc/Seametry/server/internal/liquidity"
)

// TestToAPIDepthCurveMapsAvailabilityShortfallAndAge is a DB-free check of
// depth.go's pure mapping, isolated from the Postgres-gated tests in
// instruments_test.go so a mapping bug (a swapped pointer, a wrong
// availability string) is caught without a database, the same way this
// session's own real bugs (a fabricated slot, a discarded symbol) were
// found by actually exercising the code, not by reading it.
func TestToAPIDepthCurveMapsAvailabilityShortfallAndAge(t *testing.T) {
	hundred, err := liquidity.WholeUSDC(100)
	if err != nil {
		t.Fatal(err)
	}
	thousand, err := liquidity.WholeUSDC(1000)
	if err != nil {
		t.Fatal(err)
	}
	out100, err := amount.FromInt64(1000, 2)
	if err != nil {
		t.Fatal(err)
	}
	out1000, err := amount.FromInt64(9500, 2) // a worse rate at the larger size, so shortfall is positive
	if err != nil {
		t.Fatal(err)
	}
	receivedAt := time.Date(2026, 9, 24, 21, 26, 12, 0, time.UTC)

	points := []liquidity.Point{
		{Size: hundred, Observation: liquidity.Observation{
			Availability: liquidity.Available, ReceivedAt: receivedAt,
			Quote: &liquidity.Quote{In: hundred, Out: out100},
		}},
		{Size: thousand, Observation: liquidity.Observation{
			Availability: liquidity.Available, ReceivedAt: receivedAt,
			Quote: &liquidity.Quote{In: thousand, Out: out1000},
		}},
	}
	curve, err := liquidity.BuildCurve(points)
	if err != nil {
		t.Fatal(err)
	}

	now := receivedAt.Add(45 * time.Second)
	got := toAPIDepthCurve(curve, now)

	if got.ReferenceIndex != 0 {
		t.Fatalf("reference_index = %d, want 0 (the smallest size that priced)", got.ReferenceIndex)
	}
	if len(got.Points) != 2 {
		t.Fatalf("got %d points, want 2", len(got.Points))
	}

	first := got.Points[0]
	if first.Availability != api.DepthPointAvailabilityAvailable {
		t.Errorf("point 0 availability = %q, want available", first.Availability)
	}
	if first.ShortfallBps == nil || *first.ShortfallBps != 0 {
		t.Errorf("point 0 (the reference itself) shortfall = %v, want 0", first.ShortfallBps)
	}
	if first.ReceivedAt == nil || !first.ReceivedAt.Equal(receivedAt) {
		t.Errorf("point 0 received_at = %v, want %v", first.ReceivedAt, receivedAt)
	}
	if first.AgeSeconds == nil || *first.AgeSeconds != 45 {
		t.Errorf("point 0 age_seconds = %v, want 45", first.AgeSeconds)
	}

	second := got.Points[1]
	if second.ShortfallBps == nil || *second.ShortfallBps <= 0 {
		t.Errorf("point 1 shortfall = %v, want a positive number: it realises a worse rate than the reference", second.ShortfallBps)
	}
}

// TestToAPIDepthCurveHandlesNoRouteWithNoQuote confirms a point with no
// Quote (no_route, not_tradable) never dereferences a nil pointer and never
// reports an age or received_at, since none was ever priced.
func TestToAPIDepthCurveHandlesNoRouteWithNoQuote(t *testing.T) {
	size, err := liquidity.WholeUSDC(10000)
	if err != nil {
		t.Fatal(err)
	}
	curve, err := liquidity.BuildCurve([]liquidity.Point{
		{Size: size, Observation: liquidity.Observation{Availability: liquidity.NoRoute, Code: "NO_ROUTES_FOUND"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	got := toAPIDepthCurve(curve, time.Now())
	if got.ReferenceIndex != -1 {
		t.Errorf("reference_index = %d, want -1: nothing priced", got.ReferenceIndex)
	}
	p := got.Points[0]
	if p.Availability != api.DepthPointAvailabilityUnavailable {
		t.Errorf("availability = %q, want unavailable", p.Availability)
	}
	if p.ProviderCode == nil || *p.ProviderCode != "NO_ROUTES_FOUND" {
		t.Errorf("provider_code = %v, want NO_ROUTES_FOUND", p.ProviderCode)
	}
	if p.ReceivedAt != nil {
		t.Errorf("received_at = %v, want nil: nothing was ever priced here", p.ReceivedAt)
	}
	if p.AgeSeconds != nil {
		t.Errorf("age_seconds = %v, want nil", p.AgeSeconds)
	}
	if p.ShortfallBps != nil {
		t.Errorf("shortfall_bps = %v, want nil: no reference exists to compare against", p.ShortfallBps)
	}
}
