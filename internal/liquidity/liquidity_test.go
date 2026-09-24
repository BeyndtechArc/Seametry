package liquidity

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/BeyndtechArc/Seametry/internal/amount"
	"github.com/BeyndtechArc/Seametry/internal/transport"
)

var fixtureDir = filepath.Join("..", "..", "fixtures", "jupiter")

var receivedAt = time.Date(2026, 9, 24, 12, 0, 0, 0, time.UTC)

func replay(t *testing.T, symbol string, size int64) Observation {
	t.Helper()
	c, err := LoadCapture(fixtureDir, symbol, size)
	if err != nil {
		t.Fatal(err)
	}
	in, err := WholeUSDC(size)
	if err != nil {
		t.Fatal(err)
	}
	o, err := Replay(Request{
		InputMint: USDCMint, OutputMint: c.Mint, InputDecimals: USDCDecimals, OutputDecimals: 8,
		Amount: in, SlippageBps: 50,
	}, c.Status, []byte(c.Body), receivedAt, DefaultTTL)
	if err != nil {
		t.Fatalf("%s at %d: %v", symbol, size, err)
	}
	return o
}

func TestReplayParsesARealQuote(t *testing.T) {
	o := replay(t, "AAPLx", 1000)
	if o.Availability != Available || o.Quote == nil {
		t.Fatalf("availability %s", o.Availability)
	}
	q := o.Quote
	if q.In.AtomsString() != "1000000000" || q.In.Scale() != 6 {
		t.Errorf("input %s at scale %d", q.In.AtomsString(), q.In.Scale())
	}
	if q.Out.Scale() != 8 {
		t.Errorf("output must carry the instrument's own scale, got %d", q.Out.Scale())
	}
	if q.Out.Sign() <= 0 || q.MinOut.Sign() <= 0 {
		t.Error("a priced route has a positive output and floor")
	}
	if cmp, _ := q.MinOut.Cmp(q.Out); cmp > 0 {
		t.Errorf("the floor %s cannot exceed the expected output %s", q.MinOut, q.Out)
	}
	if len(q.Hops) == 0 || q.Hops[0].Venue == "" {
		t.Error("a route names its venues")
	}
	if q.ContextSlot == 0 {
		t.Error("a quote records the slot it was priced at")
	}
	if capture, err := LoadCapture(fixtureDir, "AAPLx", 1000); err != nil || o.RawSHA256 != capture.SHA256 {
		t.Error("the observation must carry the digest of the bytes it came from")
	}
}

// Both refusals are facts about the instrument, and they are different facts.
// Folding them into one generic failure would lose that.
func TestRefusalsKeepTheirOwnReason(t *testing.T) {
	cases := []struct {
		symbol string
		size   int64
		want   Availability
		code   string
	}{
		{"CATx", 100, NoRoute, "NO_ROUTES_FOUND"},
		{"CRDAx", 100, NotTradable, "TOKEN_NOT_TRADABLE"},
	}
	for _, c := range cases {
		o := replay(t, c.symbol, c.size)
		if o.Availability != c.want || o.Code != c.code {
			t.Errorf("%s: got %s (%s), want %s (%s)", c.symbol, o.Availability, o.Code, c.want, c.code)
		}
		if o.Quote != nil {
			t.Errorf("%s: a refusal has no quote", c.symbol)
		}
	}
}

// The same instrument gave TOKEN_NOT_TRADABLE in one probe and NO_ROUTES_FOUND
// in the next. The reason is an observation at a moment, so it is recorded per
// point and never smoothed into one label for the instrument.
func TestTheReasonCanDifferAcrossSizesForOneInstrument(t *testing.T) {
	small, large := replay(t, "PALLx", 100), replay(t, "PALLx", 10000)
	if small.Code == large.Code {
		t.Skipf("PALLx currently answers %s at both sizes; the fixture no longer shows the disagreement", small.Code)
	}
	if small.Availability == large.Availability {
		t.Errorf("different codes %s and %s must not collapse to one availability", small.Code, large.Code)
	}
}

// An unknown refusal code is kept verbatim and never mapped to a known one.
func TestUnrecognisedRefusalIsKeptNotMapped(t *testing.T) {
	req := Request{InputMint: USDCMint, OutputMint: "X", Amount: amount.MustParseDecimal("100")}
	o, err := Replay(req, 400, []byte(`{"errorCode":"SOMETHING_NEW","error":"x"}`), receivedAt, DefaultTTL)
	if err != nil {
		t.Fatal(err)
	}
	if o.Availability != Unrecognised || o.Code != "SOMETHING_NEW" {
		t.Errorf("got %s (%s)", o.Availability, o.Code)
	}

	garbled, err := Replay(req, 400, []byte(`not json at all`), receivedAt, DefaultTTL)
	if err != nil {
		t.Fatal(err)
	}
	if garbled.Availability != Unrecognised {
		t.Errorf("an unreadable refusal is still unrecognised, got %s", garbled.Availability)
	}
	if len(garbled.Raw) == 0 {
		t.Error("the raw bytes are kept so the refusal can be re-examined")
	}
}

func TestReplayRefusesStatusesItDoesNotInterpret(t *testing.T) {
	for _, status := range []int{401, 404, 500, 429} {
		if _, err := Replay(Request{}, status, []byte("x"), receivedAt, DefaultTTL); err == nil {
			t.Errorf("HTTP %d is a fault, not an observation", status)
		}
	}
}

// Impact is stated as a fraction. A percent reading would understate it a
// hundredfold, which is why this was measured against realised rates.
func TestStatedImpactIsAFractionNotAPercent(t *testing.T) {
	for _, c := range []struct {
		fraction string
		bps      int64
	}{
		{"0.0205", 205},
		{"0.02051", 206}, // rounds up, the conservative direction
		{"0.1692084926795477438707635685", 1693},
		{"0", 0},
	} {
		got, err := impactToBps(c.fraction)
		if err != nil {
			t.Fatal(err)
		}
		if got != c.bps {
			t.Errorf("%s of a fraction is %d bps, got %d", c.fraction, c.bps, got)
		}
	}
}

// Absent is not zero. The aggregator states no impact at very small sizes, and
// reading that as zero would report a shallow pool as free to trade.
func TestAbsentImpactIsNotZero(t *testing.T) {
	body := `{"inputMint":"a","inAmount":"1000000","outputMint":"b","outAmount":"5","otherAmountThreshold":"4","slippageBps":50,"contextSlot":9,"routePlan":[]}`
	o, err := Replay(Request{InputDecimals: 6, OutputDecimals: 8}, 200, []byte(body), receivedAt, DefaultTTL)
	if err != nil {
		t.Fatal(err)
	}
	if o.Quote.StatedImpactBps != nil {
		t.Errorf("no impact was stated, so none may be reported, got %d", *o.Quote.StatedImpactBps)
	}
}

func TestQuoteIsRefusedAtAndAfterItsExpiry(t *testing.T) {
	q := replay(t, "AAPLx", 100).Quote

	if err := q.Require(q.ReceivedAt); err != nil {
		t.Errorf("a fresh quote must be accepted: %v", err)
	}
	if err := q.Require(q.ExpiresAt.Add(-time.Nanosecond)); err != nil {
		t.Errorf("a quote just inside its expiry must be accepted: %v", err)
	}
	for _, at := range []time.Time{q.ExpiresAt, q.ExpiresAt.Add(time.Hour)} {
		err := q.Require(at)
		if err == nil {
			t.Fatalf("a quote must be refused at %s", at)
		}
		if _, ok := err.(*ErrExpired); !ok {
			t.Errorf("the refusal should be an ErrExpired, got %T", err)
		}
	}
	if !q.ExpiresAt.Equal(q.ReceivedAt.Add(DefaultTTL)) {
		t.Errorf("expiry is receipt plus the policy TTL, got %s after %s", q.ExpiresAt, q.ReceivedAt)
	}
}

func TestShortfallIsExactAndRoundsUp(t *testing.T) {
	quote := func(in, out string) *Quote {
		return &Quote{In: mustAtoms(t, in, 6), Out: mustAtoms(t, out, 8)}
	}
	reference := quote("100000000", "1000000000")

	for _, c := range []struct {
		name    string
		in, out string
		bps     int64
	}{
		{"the reference against itself", "100000000", "1000000000", 0},
		{"the same rate at ten times the size", "1000000000", "10000000000", 0},
		{"one percent worse", "1000000000", "9900000000", 100},
		{"half the rate", "1000000000", "5000000000", 5000},
		{"a better rate at a larger size", "1000000000", "10100000000", -100},
		// 9999999999/10000000000 leaves a remainder, and it must round toward
		// overstating the shortfall.
		{"a fraction of a basis point rounds up", "1000000000", "9999999999", 1},
	} {
		got, err := Shortfall(reference, quote(c.in, c.out))
		if err != nil {
			t.Fatalf("%s: %v", c.name, err)
		}
		if got != c.bps {
			t.Errorf("%s: want %d bps, got %d", c.name, c.bps, got)
		}
	}
}

func TestShortfallRefusesAnEmptyReference(t *testing.T) {
	empty := &Quote{In: mustAtoms(t, "1", 6), Out: mustAtoms(t, "0", 8)}
	other := &Quote{In: mustAtoms(t, "1", 6), Out: mustAtoms(t, "1", 8)}
	if _, err := Shortfall(empty, other); err == nil {
		t.Fatal("a zero output cannot anchor a comparison")
	}
}

// The curve measured live on 24 September 2026, replayed from the stored bytes.
func TestRealCurvesReproduceTheMeasuredDepth(t *testing.T) {
	build := func(symbol string) Curve {
		var points []Point
		for _, size := range []int64{100, 1000, 10000} {
			o := replay(t, symbol, size)
			points = append(points, Point{Size: mustAtoms(t, fmt.Sprintf("%d", size*1_000_000), 6), Observation: o})
		}
		curve, err := BuildCurve(points)
		if err != nil {
			t.Fatal(err)
		}
		return curve
	}

	aapl := build("AAPLx")
	if aapl.Reference != 0 {
		t.Fatalf("reference index %d, want 0", aapl.Reference)
	}
	if *aapl.Points[0].ShortfallBps != 0 {
		t.Error("the reference is zero against itself")
	}
	if !(*aapl.Points[0].ShortfallBps <= *aapl.Points[1].ShortfallBps && *aapl.Points[1].ShortfallBps <= *aapl.Points[2].ShortfallBps) {
		t.Errorf("depth should worsen with size for AAPLx, got %d, %d, %d",
			*aapl.Points[0].ShortfallBps, *aapl.Points[1].ShortfallBps, *aapl.Points[2].ShortfallBps)
	}

	// Thin depth is visible as a number: STRKx loses most of the trade by 1000.
	strk := build("STRKx")
	if got := *strk.Points[1].ShortfallBps; got < 5000 {
		t.Errorf("STRKx at 1000 USDC should show a severe shortfall, got %d bps", got)
	}

	// An instrument with no route has no reference and no shortfalls.
	cat := build("CATx")
	if cat.Reference != -1 {
		t.Errorf("no route anywhere means no reference, got %d", cat.Reference)
	}
	for i, p := range cat.Points {
		if p.ShortfallBps != nil {
			t.Errorf("point %d has no quote, so no shortfall", i)
		}
	}
}

func TestSampleOrdersSizesSoTheReferenceIsReproducible(t *testing.T) {
	sizes := []amount.Amount{mustAtoms(t, "10000000000", 6), mustAtoms(t, "100000000", 6), mustAtoms(t, "1000000000", 6)}
	ordered, err := sortSizes(sizes)
	if err != nil {
		t.Fatal(err)
	}
	for i, want := range []string{"100000000", "1000000000", "10000000000"} {
		if ordered[i].AtomsString() != want {
			t.Errorf("position %d is %s, want %s", i, ordered[i].AtomsString(), want)
		}
	}
	if sizes[0].AtomsString() != "10000000000" {
		t.Error("sorting must not reorder the caller's slice")
	}
}

/* The client against a fake server. */

func newServed(t *testing.T, handler http.HandlerFunc) *Client {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	return New(Options{
		BaseURL: server.URL, APIKey: "test-key",
		Transport: transport.Options{RequestsPerSecond: 1000, Burst: 1000},
	})
}

func TestObserveSendsTheKeyAndTheRequestedAmount(t *testing.T) {
	var seen *http.Request
	client := newServed(t, func(w http.ResponseWriter, r *http.Request) {
		seen = r
		capture, err := LoadCapture(fixtureDir, "AAPLx", 100)
		if err != nil {
			t.Error(err)
			return
		}
		_, _ = w.Write([]byte(capture.Body))
	})
	amountIn := mustAtoms(t, "100000000", 6)
	o, err := client.Observe(context.Background(), Request{
		InputMint: USDCMint, OutputMint: "M", InputDecimals: 6, OutputDecimals: 8, Amount: amountIn, SlippageBps: 50,
	})
	if err != nil {
		t.Fatal(err)
	}
	if o.Availability != Available {
		t.Fatalf("availability %s", o.Availability)
	}
	if seen.Header.Get("x-api-key") != "test-key" {
		t.Error("the key must be sent as a header")
	}
	if !strings.Contains(seen.URL.RawQuery, "amount=100000000") || !strings.Contains(seen.URL.RawQuery, "slippageBps=50") {
		t.Errorf("query %q", seen.URL.RawQuery)
	}
	if strings.Contains(seen.URL.RawQuery, "test-key") {
		t.Error("the key must never travel in the URL, where it would be logged")
	}
}

// A refusal that describes the instrument is an answer, not a failure.
func TestObserveReturnsARefusalAsAnObservation(t *testing.T) {
	client := newServed(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":"No routes found","errorCode":"NO_ROUTES_FOUND"}`))
	})
	o, err := client.Observe(context.Background(), Request{Amount: mustAtoms(t, "1", 6)})
	if err != nil {
		t.Fatalf("no route is an answer, not an error: %v", err)
	}
	if o.Availability != NoRoute {
		t.Errorf("availability %s", o.Availability)
	}
}

func TestObserveReportsRealFaultsAsErrors(t *testing.T) {
	var attempts int32
	client := newServed(t, func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&attempts, 1)
		w.WriteHeader(http.StatusUnauthorized)
	})
	if _, err := client.Observe(context.Background(), Request{Amount: mustAtoms(t, "1", 6)}); err == nil {
		t.Fatal("a rejected credential is a fault")
	}
	if attempts != 1 {
		t.Errorf("a rejected credential was attempted %d times", attempts)
	}
}

func mustAtoms(t *testing.T, v string, scale int32) amount.Amount {
	t.Helper()
	a, err := amount.ParseAtoms(v, scale)
	if err != nil {
		t.Fatal(err)
	}
	return a
}
