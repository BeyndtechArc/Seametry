package transport

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type roundTripper func(*http.Request) (*http.Response, error)

func (f roundTripper) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func reply(status int, body string, headers map[string]string) *http.Response {
	response := &http.Response{
		StatusCode: status,
		Body:       io.NopCloser(strings.NewReader(body)),
		Header:     http.Header{},
	}
	for k, v := range headers {
		response.Header.Set(k, v)
	}
	return response
}

// newTestClient returns a client whose clock and sleeps are virtual, so pacing
// and backoff are asserted by their arithmetic rather than by waiting.
func newTestClient(opts Options, handler roundTripper) (*Client, *time.Time) {
	clock := time.Date(2026, 9, 24, 0, 0, 0, 0, time.UTC)
	opts.HTTPClient = &http.Client{Transport: handler}
	opts.Clock = func() time.Time { return clock }
	opts.Sleep = func(ctx context.Context, d time.Duration) error {
		clock = clock.Add(d)
		return ctx.Err()
	}
	return New(opts), &clock
}

func get() (*http.Request, error) {
	return http.NewRequest(http.MethodGet, "https://service.invalid/x", nil)
}

func TestDoReturnsTheBody(t *testing.T) {
	client, _ := newTestClient(Options{}, func(*http.Request) (*http.Response, error) {
		return reply(200, "hello", nil), nil
	})
	body, err := client.Do(context.Background(), 1, get, nil)
	if err != nil {
		t.Fatal(err)
	}
	if string(body) != "hello" {
		t.Errorf("body %q", body)
	}
	if u := client.Usage(); u.Requests != 1 || u.Cost != 1 || u.Retries != 0 {
		t.Errorf("usage %+v", u)
	}
}

func TestCostIsCountedInTheCallersUnits(t *testing.T) {
	client, _ := newTestClient(Options{}, func(*http.Request) (*http.Response, error) {
		return reply(200, "", nil), nil
	})
	for _, cost := range []float64{1, 10} {
		if _, err := client.Do(context.Background(), cost, get, nil); err != nil {
			t.Fatal(err)
		}
	}
	if got := client.Usage().Cost; got != 11 {
		t.Errorf("a one unit call and a ten unit call cost 11, got %.0f", got)
	}
}

func TestRetriesOn429ThenSucceeds(t *testing.T) {
	var attempts int32
	client, _ := newTestClient(Options{}, func(*http.Request) (*http.Response, error) {
		if atomic.AddInt32(&attempts, 1) < 3 {
			return reply(429, "slow", nil), nil
		}
		return reply(200, "ok", nil), nil
	})
	if _, err := client.Do(context.Background(), 1, get, nil); err != nil {
		t.Fatal(err)
	}
	if u := client.Usage(); u.Retries != 2 {
		t.Errorf("expected 2 retries, got %d", u.Retries)
	}
}

// When the server says how long to wait, that beats our own guess. Ignoring the
// header is how a client keeps hammering an endpoint that asked it to stop.
func TestRetryAfterIsObeyed(t *testing.T) {
	var attempts int32
	client, clock := newTestClient(Options{}, func(*http.Request) (*http.Response, error) {
		if atomic.AddInt32(&attempts, 1) == 1 {
			return reply(429, "", map[string]string{"Retry-After": "7"}), nil
		}
		return reply(200, "ok", nil), nil
	})
	before := *clock
	if _, err := client.Do(context.Background(), 1, get, nil); err != nil {
		t.Fatal(err)
	}
	if waited := clock.Sub(before); waited < 7*time.Second {
		t.Errorf("waited %s, the server asked for 7s", waited)
	}
}

func TestGivesUpAfterMaxRetries(t *testing.T) {
	var attempts int32
	client, _ := newTestClient(Options{MaxRetries: 2}, func(*http.Request) (*http.Response, error) {
		atomic.AddInt32(&attempts, 1)
		return reply(503, "down", nil), nil
	})
	if _, err := client.Do(context.Background(), 1, get, nil); err == nil {
		t.Fatal("expected failure")
	}
	if attempts != 3 {
		t.Errorf("1 attempt plus 2 retries is 3, got %d", attempts)
	}
}

// A bad credential does not improve with repetition, and retrying it spends
// budget and delays the operator learning what is wrong.
func TestClientErrorsAreNotRetried(t *testing.T) {
	for _, status := range []int{400, 401, 403, 404} {
		var attempts int32
		client, _ := newTestClient(Options{}, func(*http.Request) (*http.Response, error) {
			atomic.AddInt32(&attempts, 1)
			return reply(status, "no", nil), nil
		})
		_, err := client.Do(context.Background(), 1, get, nil)
		var permanent *PermanentError
		if !errors.As(err, &permanent) {
			t.Errorf("HTTP %d should be a permanent failure, got %v", status, err)
		}
		if attempts != 1 {
			t.Errorf("HTTP %d was attempted %d times", status, attempts)
		}
	}
}

// A service that reports failure inside a 200, as JSON-RPC does, gets the same
// treatment through check.
func TestCheckDecidesWhetherASuccessfulResponseIsRetried(t *testing.T) {
	var attempts int32
	client, _ := newTestClient(Options{}, func(*http.Request) (*http.Response, error) {
		if atomic.AddInt32(&attempts, 1) == 1 {
			return reply(200, "busy", nil), nil
		}
		return reply(200, "fine", nil), nil
	})
	check := func(body []byte) error {
		if string(body) == "busy" {
			return &RetryableError{Err: errors.New("busy")}
		}
		return nil
	}
	body, err := client.Do(context.Background(), 1, get, check)
	if err != nil {
		t.Fatal(err)
	}
	if string(body) != "fine" || attempts != 2 {
		t.Errorf("body %q after %d attempts", body, attempts)
	}

	attempts = 0
	stop := func([]byte) error { return &PermanentError{Err: errors.New("bad request")} }
	if _, err := client.Do(context.Background(), 1, get, stop); err == nil {
		t.Fatal("a permanent check failure must stop")
	}
	if attempts != 1 {
		t.Errorf("a permanent check failure was retried, %d attempts", attempts)
	}
}

func TestCancelledContextStopsTheCall(t *testing.T) {
	client, _ := newTestClient(Options{RequestsPerSecond: 0.001, Burst: 1}, func(*http.Request) (*http.Response, error) {
		return reply(200, "ok", nil), nil
	})
	ctx, cancel := context.WithCancel(context.Background())
	if _, err := client.Do(ctx, 1, get, nil); err != nil {
		t.Fatal(err)
	}
	cancel()
	if _, err := client.Do(ctx, 1, get, nil); err == nil {
		t.Fatal("a cancelled context must stop the call")
	}
}

// The limiter's arithmetic, asserted without sleeping: at 10 a second with a
// burst of 4, the first four go at once and the fifth waits 100ms.
func TestLimiterBurstsThenPaces(t *testing.T) {
	clock := time.Date(2026, 9, 24, 0, 0, 0, 0, time.UTC)
	l := NewLimiter(10, 4, func() time.Time { return clock })

	for i := 0; i < 4; i++ {
		if d := l.Reserve(1); d != 0 {
			t.Fatalf("request %d is within the burst but waited %s", i+1, d)
		}
	}
	d := l.Reserve(1)
	if want := 100 * time.Millisecond; d < want-time.Millisecond || d > want+time.Millisecond {
		t.Errorf("expected about %s at 10 a second, got %s", want, d)
	}

	clock = clock.Add(time.Second)
	if d := l.Reserve(1); d != 0 {
		t.Errorf("after a second of refill the next request should go at once, waited %s", d)
	}
}

// A ten unit call spends ten times the budget of a one unit call, so the limiter
// must charge it accordingly or the configured rate is a fiction.
func TestLimiterChargesByCost(t *testing.T) {
	clock := time.Date(2026, 9, 24, 0, 0, 0, 0, time.UTC)
	l := NewLimiter(10, 10, func() time.Time { return clock })

	if d := l.Reserve(10); d != 0 {
		t.Fatalf("a ten unit call fits a ten token burst, waited %s", d)
	}
	if d := l.Reserve(1); d <= 0 {
		t.Error("the burst is spent, so the next call must wait")
	}
}

func TestLimiterIsConcurrencySafe(t *testing.T) {
	// Frozen, or tokens refill while the goroutines run and the final balance
	// stops being a statement about lost reservations.
	frozen := time.Date(2026, 9, 24, 0, 0, 0, 0, time.UTC)
	l := NewLimiter(1000, 1000, func() time.Time { return frozen })

	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 20; j++ {
				l.Reserve(1)
			}
		}()
	}
	wg.Wait()
	if l.tokens > 0.001 || l.tokens < -0.001 {
		t.Errorf("exactly as many reservations as tokens should leave the bucket empty, got %f", l.tokens)
	}
}

func TestWaitReportsTheDelayItImposed(t *testing.T) {
	clock := time.Date(2026, 9, 24, 0, 0, 0, 0, time.UTC)
	l := NewLimiter(1000, 1, func() time.Time { return clock })

	if d, err := l.Wait(context.Background(), 1); err != nil || d != 0 {
		t.Fatalf("the first call is within the burst: delay %s err %v", d, err)
	}
	d, err := l.Wait(context.Background(), 1)
	if err != nil {
		t.Fatal(err)
	}
	if d <= 0 {
		t.Error("the second call had to wait and must say how long")
	}
}

// A service can report a fact through an error status, so the caller must be
// able to read the status and body rather than a flattened message.
func TestStatusErrorKeepsTheBodyForTheCaller(t *testing.T) {
	client, _ := newTestClient(Options{}, func(*http.Request) (*http.Response, error) {
		return reply(400, `{"errorCode":"NO_ROUTES_FOUND"}`, nil), nil
	})
	_, err := client.Do(context.Background(), 1, get, nil)

	var status *StatusError
	if !errors.As(err, &status) {
		t.Fatalf("expected a StatusError, got %T: %v", err, err)
	}
	if status.Code != 400 || !strings.Contains(string(status.Body), "NO_ROUTES_FOUND") {
		t.Errorf("status %d body %q", status.Code, status.Body)
	}
}
