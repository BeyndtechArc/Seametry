package solana

import (
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

type roundTripper func(*http.Request) (*http.Response, error)

func (f roundTripper) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func reply(status int, body string) *http.Response {
	return &http.Response{StatusCode: status, Body: io.NopCloser(strings.NewReader(body)), Header: http.Header{}}
}

// newTestClient has a virtual clock and no real sleeps, and a limit generous
// enough that pacing never gets in the way of what is being tested.
func newTestClient(t *testing.T, handler roundTripper) *Client {
	t.Helper()
	clock := time.Date(2026, 9, 24, 0, 0, 0, 0, time.UTC)
	client, err := New("https://rpc.invalid", Options{
		RequestsPerSecond: 1000, Burst: 1000,
		HTTPClient: &http.Client{Transport: handler},
		Clock:      func() time.Time { return clock },
		Sleep: func(ctx context.Context, d time.Duration) error {
			clock = clock.Add(d)
			return ctx.Err()
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	return client
}

func TestCallReturnsTheResult(t *testing.T) {
	client := newTestClient(t, func(*http.Request) (*http.Response, error) {
		return reply(200, `{"jsonrpc":"2.0","id":1,"result":12345}`), nil
	})
	raw, err := client.Call(context.Background(), "getSlot", nil)
	if err != nil {
		t.Fatal(err)
	}
	if string(raw) != "12345" {
		t.Errorf("result %s", raw)
	}
}

// getProgramAccounts costs ten credits, not one. A loop that looks cheap in
// requests can be expensive in credits, and that is the budget that runs out.
func TestCreditCostIsNotUniform(t *testing.T) {
	client := newTestClient(t, func(*http.Request) (*http.Response, error) {
		return reply(200, `{"result":[]}`), nil
	})
	for _, method := range []string{"getSlot", "getProgramAccounts"} {
		if _, err := client.Call(context.Background(), method, nil); err != nil {
			t.Fatal(err)
		}
	}
	if got := client.Usage().Cost; got != 11 {
		t.Errorf("1 + 10 = 11 credits, got %.0f", got)
	}
}

// The node's own rate limit reply arrives inside a 200, and is the one RPC
// error worth repeating.
func TestNodeRateLimitReplyIsRetried(t *testing.T) {
	var attempts int32
	client := newTestClient(t, func(*http.Request) (*http.Response, error) {
		if atomic.AddInt32(&attempts, 1) == 1 {
			return reply(200, `{"error":{"code":-32005,"message":"Node is behind"}}`), nil
		}
		return reply(200, `{"result":1}`), nil
	})
	if _, err := client.Call(context.Background(), "getSlot", nil); err != nil {
		t.Fatal(err)
	}
	if attempts != 2 {
		t.Errorf("expected one retry, got %d attempts", attempts)
	}
}

// A malformed request is our bug, and repeating it is waste.
func TestOtherRPCErrorsAreNotRetried(t *testing.T) {
	var attempts int32
	client := newTestClient(t, func(*http.Request) (*http.Response, error) {
		atomic.AddInt32(&attempts, 1)
		return reply(200, `{"error":{"code":-32602,"message":"Invalid params"}}`), nil
	})
	if _, err := client.Call(context.Background(), "getSlot", nil); err == nil {
		t.Fatal("expected failure")
	}
	if attempts != 1 {
		t.Errorf("an invalid params error was attempted %d times", attempts)
	}
}

func TestGetMultipleAccountsChunks(t *testing.T) {
	var calls int32
	client := newTestClient(t, func(r *http.Request) (*http.Response, error) {
		atomic.AddInt32(&calls, 1)
		body, _ := io.ReadAll(r.Body)
		count := strings.Count(string(body), "addr")
		if count > MaxAccountsPerCall {
			t.Errorf("a chunk asked for %d accounts, above the %d ceiling", count, MaxAccountsPerCall)
		}
		values := make([]string, count)
		for i := range values {
			values[i] = fmt.Sprintf(`{"data":["%s","base64"],"owner":"o","lamports":1}`,
				base64.StdEncoding.EncodeToString([]byte("x")))
		}
		return reply(200, fmt.Sprintf(`{"result":{"context":{"slot":42},"value":[%s]}}`, strings.Join(values, ","))), nil
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
		t.Errorf("250 addresses at a ceiling of %d take 3 calls, took %d", MaxAccountsPerCall, calls)
	}
	if len(accounts) != 250 || slot != 42 {
		t.Errorf("got %d accounts at slot %d", len(accounts), slot)
	}
}

// A missing account must come back as a hole at its own index. Dropping it
// would shift every later account onto the wrong address, which produces
// confidently wrong output.
func TestMissingAccountKeepsItsPosition(t *testing.T) {
	client := newTestClient(t, func(*http.Request) (*http.Response, error) {
		return reply(200, fmt.Sprintf(
			`{"result":{"context":{"slot":1},"value":[{"data":["%s","base64"],"owner":"o","lamports":1},null,{"data":["%s","base64"],"owner":"o","lamports":1}]}}`,
			base64.StdEncoding.EncodeToString([]byte("a")),
			base64.StdEncoding.EncodeToString([]byte("c")))), nil
	})
	_, accounts, err := client.GetMultipleAccounts(context.Background(), []string{"a", "b", "c"}, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(accounts) != 3 || accounts[1] != nil {
		t.Fatalf("index 1 should be a hole in a list of 3, got %d entries", len(accounts))
	}
	if accounts[0].Address != "a" || string(accounts[0].Data) != "a" {
		t.Error("index 0 is wrong")
	}
	if accounts[2].Address != "c" || string(accounts[2].Data) != "c" {
		t.Error("index 2 lost its alignment with its address")
	}
}

func TestNewRejectsAnEmptyEndpoint(t *testing.T) {
	if _, err := New("", Options{}); err == nil {
		t.Fatal("an empty endpoint was accepted")
	}
}
