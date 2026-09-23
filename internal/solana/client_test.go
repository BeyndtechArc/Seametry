package solana

import (
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// roundTripper lets every test run without a network, so the suite is fast,
// offline, and does not spend anyone's credits to prove it handles credits.
type roundTripper func(*http.Request) (*http.Response, error)

func (f roundTripper) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func respond(status int, body string, headers map[string]string) *http.Response {
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

// testClient returns a client whose sleeps and clock are instant, so backoff
// and rate limiting are asserted by their arithmetic rather than by waiting.
func testClient(t *testing.T, opts Options, handler roundTripper) (*Client, *time.Time) {
	t.Helper()
	opts.HTTPClient = &http.Client{Transport: handler}
	client, err := New("https://rpc.invalid", opts)
	if err != nil {
		t.Fatal(err)
	}
	clock := time.Date(2026, 9, 23, 0, 0, 0, 0, time.UTC)
	client.limiter.now = func() time.Time { return clock }
	client.sleep = func(ctx context.Context, d time.Duration) error {
		clock = clock.Add(d)
		return ctx.Err()
	}
	return client, &clock
}

func TestCallSucceeds(t *testing.T) {
	client, _ := testClient(t, Options{}, func(*http.Request) (*http.Response, error) {
		return respond(200, `{"jsonrpc":"2.0","id":1,"result":12345}`, nil), nil
	})
	raw, err := client.Call(context.Background(), "getSlot", nil)
	if err != nil {
		t.Fatal(err)
	}
	if string(raw) != "12345" {
		t.Errorf("result %s", raw)
	}
	if u := client.Usage(); u.Requests != 1 || u.Credits != 1 || u.Retries != 0 {
		t.Errorf("usage %+v", u)
	}
}

// getProgramAccounts costs ten credits, not one. A loop that looks cheap in
// requests can be expensive in credits, and that is the budget that runs out.
func TestCreditCostIsNotUniform(t *testing.T) {
	client, _ := testClient(t, Options{}, func(*http.Request) (*http.Response, error) {
		return respond(200, `{"result":[]}`, nil), nil
	})
	ctx := context.Background()
	if _, err := client.Call(ctx, "getSlot", nil); err != nil {
		t.Fatal(err)
	}
	if _, err := client.Call(ctx, "getProgramAccounts", nil); err != nil {
		t.Fatal(err)
	}
	if u := client.Usage(); u.Credits != 11 {
		t.Errorf("two calls should cost 1 + 10 = 11 credits, got %.0f", u.Credits)
	}
}

func TestRetriesOn429ThenSucceeds(t *testing.T) {
	var attempts int32
	client, _ := testClient(t, Options{}, func(*http.Request) (*http.Response, error) {
		if atomic.AddInt32(&attempts, 1) < 3 {
			return respond(429, `rate limited`, nil), nil
		}
		return respond(200, `{"result":"ok"}`, nil), nil
	})
	raw, err := client.Call(context.Background(), "getSlot", nil)
	if err != nil {
		t.Fatal(err)
	}
	if string(raw) != `"ok"` {
		t.Errorf("result %s", raw)
	}
	if u := client.Usage(); u.Retries != 2 {
		t.Errorf("expected 2 retries, got %d", u.Retries)
	}
}

// When the server says how long to wait, that beats our own guess. Ignoring
// the header is how a client keeps hammering an endpoint that just asked it
// politely to stop.
func TestRetryAfterHeaderIsObeyed(t *testing.T) {
	var attempts int32
	client, clock := testClient(t, Options{}, func(*http.Request) (*http.Response, error) {
		if atomic.AddInt32(&attempts, 1) == 1 {
			return respond(429, `slow down`, map[string]string{"Retry-After": "7"}), nil
		}
		return respond(200, `{"result":1}`, nil), nil
	})
	before := *clock
	if _, err := client.Call(context.Background(), "getSlot", nil); err != nil {
		t.Fatal(err)
	}
	if waited := clock.Sub(before); waited < 7*time.Second {
		t.Errorf("waited %s, expected at least the 7s the server asked for", waited)
	}
}

func TestGivesUpAfterMaxRetries(t *testing.T) {
	var attempts int32
	client, _ := testClient(t, Options{MaxRetries: 2}, func(*http.Request) (*http.Response, error) {
		atomic.AddInt32(&attempts, 1)
		return respond(503, `unavailable`, nil), nil
	})
	if _, err := client.Call(context.Background(), "getSlot", nil); err == nil {
		t.Fatal("expected failure")
	}
	if attempts != 3 {
		t.Errorf("expected 3 attempts (1 + 2 retries), got %d", attempts)
	}
}

// A bad credential does not improve with repetition, and retrying it wastes
// budget and delays the operator learning what is actually wrong.
func TestAuthFailuresAreNotRetried(t *testing.T) {
	for _, status := range []int{401, 403} {
		var attempts int32
		client, _ := testClient(t, Options{}, func(*http.Request) (*http.Response, error) {
			atomic.AddInt32(&attempts, 1)
			return respond(status, `denied`, nil), nil
		})
		if _, err := client.Call(context.Background(), "getSlot", nil); err == nil {
			t.Fatalf("HTTP %d should fail", status)
		}
		if attempts != 1 {
			t.Errorf("HTTP %d was retried %d times; it should not be retried at all", status, attempts)
		}
	}
}

// A malformed request is our bug. Retrying it is pure waste.
func TestRPCErrorsAreNotRetried(t *testing.T) {
	var attempts int32
	client, _ := testClient(t, Options{}, func(*http.Request) (*http.Response, error) {
		atomic.AddInt32(&attempts, 1)
		return respond(200, `{"error":{"code":-32602,"message":"Invalid params"}}`, nil), nil
	})
	if _, err := client.Call(context.Background(), "getSlot", nil); err == nil {
		t.Fatal("expected failure")
	}
	if attempts != 1 {
		t.Errorf("an invalid params error was retried %d times", attempts)
	}
}

// The node's own rate limit code is the exception: that one is worth retrying.
func TestNodeRateLimitErrorIsRetried(t *testing.T) {
	var attempts int32
	client, _ := testClient(t, Options{}, func(*http.Request) (*http.Response, error) {
		if atomic.AddInt32(&attempts, 1) == 1 {
			return respond(200, `{"error":{"code":-32005,"message":"Node is behind"}}`, nil), nil
		}
		return respond(200, `{"result":1}`, nil), nil
	})
	if _, err := client.Call(context.Background(), "getSlot", nil); err != nil {
		t.Fatal(err)
	}
	if attempts != 2 {
		t.Errorf("expected one retry, got %d attempts", attempts)
	}
}

// The limiter's arithmetic, asserted without sleeping: at 10 per second with a
// burst of 4, the first four go immediately and the fifth waits 100ms.
func TestLimiterBurstsThenPaces(t *testing.T) {
	l := newLimiter(10, 4)
	clock := time.Date(2026, 9, 23, 0, 0, 0, 0, time.UTC)
	l.now = func() time.Time { return clock }

	for i := 0; i < 4; i++ {
		if delay := l.reserve(1); delay != 0 {
			t.Fatalf("request %d should not wait within the burst, waited %s", i+1, delay)
		}
	}
	delay := l.reserve(1)
	if delay <= 0 {
		t.Fatal("the request after the burst must wait")
	}
	if want := 100 * time.Millisecond; delay < want-time.Millisecond || delay > want+time.Millisecond {
		t.Errorf("expected about %s at 10 per second, got %s", want, delay)
	}

	// Tokens refill with time, so after a second the burst is available again.
	clock = clock.Add(time.Second)
	if d := l.reserve(1); d != 0 {
		t.Errorf("after a second of refill the next request should not wait, waited %s", d)
	}
}

// A ten credit call consumes ten times the budget of a one credit call, so the
// limiter has to charge it accordingly or the configured rate is a fiction.
func TestLimiterChargesByCost(t *testing.T) {
	l := newLimiter(10, 10)
	clock := time.Date(2026, 9, 23, 0, 0, 0, 0, time.UTC)
	l.now = func() time.Time { return clock }

	if d := l.reserve(10); d != 0 {
		t.Fatalf("a ten cost call should fit the ten token burst, waited %s", d)
	}
	if d := l.reserve(1); d <= 0 {
		t.Error("the burst is spent, so the next call must wait")
	}
}

func TestLimiterIsConcurrencySafe(t *testing.T) {
	l := newLimiter(1000, 1000)
	// The clock is frozen, or tokens refill while the goroutines run and the
	// final count stops being a statement about lost reservations.
	frozen := time.Date(2026, 9, 23, 0, 0, 0, 0, time.UTC)
	l.now = func() time.Time { return frozen }

	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 20; j++ {
				l.reserve(1)
			}
		}()
	}
	wg.Wait()
	// 1000 reservations against a 1000 token burst leaves the bucket empty and
	// not negative beyond that, which is what proves none were lost or double
	// counted.
	if l.tokens > 0.001 || l.tokens < -0.001 {
		t.Errorf("after exactly as many reservations as tokens, the bucket should be empty, got %f", l.tokens)
	}
}

func TestGetMultipleAccountsChunks(t *testing.T) {
	var calls int32
	client, _ := testClient(t, Options{RequestsPerSecond: 1000, Burst: 1000},
		func(r *http.Request) (*http.Response, error) {
			atomic.AddInt32(&calls, 1)
			body, _ := io.ReadAll(r.Body)
			// Count how many addresses this chunk asked for.
			count := strings.Count(string(body), "addr")
			if count > MaxAccountsPerCall {
				t.Errorf("a chunk asked for %d accounts, more than the %d ceiling", count, MaxAccountsPerCall)
			}
			values := make([]string, count)
			for i := range values {
				values[i] = fmt.Sprintf(`{"data":["%s","base64"],"owner":"o","lamports":1,"executable":false}`,
					base64.StdEncoding.EncodeToString([]byte("x")))
			}
			return respond(200, fmt.Sprintf(`{"result":{"context":{"slot":42},"value":[%s]}}`,
				strings.Join(values, ",")), nil), nil
		})

	addresses := make([]string, 250)
	for i := range addresses {
		addresses[i] = fmt.Sprintf("addr%d", i)
	}
	slot, accounts, err := client.GetMultipleAccounts(context.Background(), addresses, "finalized")
	if err != nil {
		t.Fatal(err)
	}
	if calls != 3 {
		t.Errorf("250 addresses at a ceiling of %d should take 3 calls, took %d", MaxAccountsPerCall, calls)
	}
	if len(accounts) != 250 {
		t.Errorf("got %d accounts for 250 addresses", len(accounts))
	}
	if slot != 42 {
		t.Errorf("slot %d", slot)
	}
}

// A missing account must come back as a hole at its own index. Dropping it
// would silently shift every later account onto the wrong address, which is
// the kind of defect that produces confidently wrong output.
func TestMissingAccountKeepsItsPosition(t *testing.T) {
	client, _ := testClient(t, Options{}, func(*http.Request) (*http.Response, error) {
		return respond(200, fmt.Sprintf(
			`{"result":{"context":{"slot":1},"value":[{"data":["%s","base64"],"owner":"o","lamports":1},null,{"data":["%s","base64"],"owner":"o","lamports":1}]}}`,
			base64.StdEncoding.EncodeToString([]byte("a")),
			base64.StdEncoding.EncodeToString([]byte("c"))), nil), nil
	})
	_, accounts, err := client.GetMultipleAccounts(context.Background(), []string{"a", "b", "c"}, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(accounts) != 3 {
		t.Fatalf("got %d accounts", len(accounts))
	}
	if accounts[1] != nil {
		t.Error("the missing account should be a nil at index 1")
	}
	if accounts[0] == nil || accounts[0].Address != "a" || string(accounts[0].Data) != "a" {
		t.Error("index 0 is wrong")
	}
	if accounts[2] == nil || accounts[2].Address != "c" || string(accounts[2].Data) != "c" {
		t.Error("index 2 lost its alignment with its address")
	}
}

func TestContextCancellationStops(t *testing.T) {
	client, _ := testClient(t, Options{RequestsPerSecond: 0.001, Burst: 1},
		func(*http.Request) (*http.Response, error) {
			return respond(200, `{"result":1}`, nil), nil
		})
	ctx, cancel := context.WithCancel(context.Background())

	// Spend the burst, so the next call has to wait a long time.
	if _, err := client.Call(ctx, "getSlot", nil); err != nil {
		t.Fatal(err)
	}
	cancel()
	if _, err := client.Call(ctx, "getSlot", nil); err == nil {
		t.Fatal("a cancelled context must stop the call")
	}
}

func TestNewRejectsEmptyEndpoint(t *testing.T) {
	if _, err := New("", Options{}); err == nil {
		t.Fatal("an empty endpoint was accepted")
	}
}
