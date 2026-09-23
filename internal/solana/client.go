// Package solana is the RPC client every chain read goes through.
//
// It exists mostly to make three things impossible to forget.
//
// Rate limits are respected before a request goes out, not discovered from a
// 429 afterwards. A shared endpoint punishes a caller who learns its limits by
// exceeding them, and a demonstration that dies mid-run because an observation
// loop was impolite is a bad way to find out.
//
// Credits are counted, because on a metered plan they are the real budget and
// they are not uniform. Helius charges one credit for a normal call and ten for
// getProgramAccounts, so a loop that looks cheap in requests per second can be
// expensive in credits per month. The client tracks both and can report them.
//
// Retries are bounded, backed off, jittered, and only ever applied to requests
// that are safe to repeat. A read is safe. Submitting a transaction is not, and
// this client does not submit transactions.
package solana

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"strconv"
	"sync"
	"time"
)

// MaxAccountsPerCall is the ceiling getMultipleAccounts accepts. Larger
// requests are chunked rather than refused, because the caller usually has a
// list rather than a batch.
const MaxAccountsPerCall = 100

// Credit costs, from the provider's published schedule. A method absent here
// costs one.
var creditCost = map[string]float64{
	"getProgramAccounts": 10,
	"getAssetsByOwner":   10,
	"getAsset":           10,
	"searchAssets":       10,
}

func costOf(method string) float64 {
	if c, ok := creditCost[method]; ok {
		return c
	}
	return 1
}

// Options configure a Client. The zero value is usable and conservative.
type Options struct {
	// RequestsPerSecond defaults to 8, slightly under the 10 that the common
	// free tier allows, because the advertised limit is the point at which
	// requests start failing rather than a target to sit on.
	RequestsPerSecond float64
	// Burst defaults to 4.
	Burst int
	// MaxRetries defaults to 4.
	MaxRetries int
	// Timeout for a single attempt. Defaults to 45 seconds.
	Timeout time.Duration
	// HTTPClient is injectable for tests.
	HTTPClient *http.Client
}

// Client is a Solana JSON-RPC client. It is safe for concurrent use.
type Client struct {
	endpoint   string
	http       *http.Client
	limiter    *limiter
	maxRetries int

	mu       sync.Mutex
	requests int
	credits  float64
	retries  int
	waited   time.Duration

	// sleep is injectable so backoff does not really sleep in tests.
	sleep func(context.Context, time.Duration) error
}

// New builds a client for an endpoint.
func New(endpoint string, opts Options) (*Client, error) {
	if endpoint == "" {
		return nil, fmt.Errorf("solana: endpoint is empty")
	}
	if opts.RequestsPerSecond == 0 {
		opts.RequestsPerSecond = 8
	}
	if opts.Burst == 0 {
		opts.Burst = 4
	}
	if opts.MaxRetries == 0 {
		opts.MaxRetries = 4
	}
	if opts.Timeout == 0 {
		opts.Timeout = 45 * time.Second
	}
	client := opts.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: opts.Timeout}
	}
	return &Client{
		endpoint:   endpoint,
		http:       client,
		limiter:    newLimiter(opts.RequestsPerSecond, opts.Burst),
		maxRetries: opts.MaxRetries,
		sleep: func(ctx context.Context, d time.Duration) error {
			timer := time.NewTimer(d)
			defer timer.Stop()
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-timer.C:
				return nil
			}
		},
	}, nil
}

// Usage reports what this client has spent.
type Usage struct {
	Requests int
	Credits  float64
	Retries  int
	// Waited is time spent held back by the rate limiter, which is the honest
	// measure of whether the configured rate is the binding constraint.
	Waited time.Duration
}

// Usage returns a snapshot.
func (c *Client) Usage() Usage {
	c.mu.Lock()
	defer c.mu.Unlock()
	return Usage{Requests: c.requests, Credits: c.credits, Retries: c.retries, Waited: c.waited}
}

func (u Usage) String() string {
	return fmt.Sprintf("%d requests, %.0f credits, %d retries, %s held by the rate limiter",
		u.Requests, u.Credits, u.Retries, u.Waited.Round(time.Millisecond))
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func (e *rpcError) Error() string { return fmt.Sprintf("rpc error %d: %s", e.Code, e.Message) }

type rpcResponse struct {
	Result json.RawMessage `json:"result"`
	Error  *rpcError       `json:"error"`
}

// Call makes one JSON-RPC request, waiting for rate limit budget first and
// retrying transient failures with jittered exponential backoff.
func (c *Client) Call(ctx context.Context, method string, params []any) (json.RawMessage, error) {
	cost := costOf(method)

	body, err := json.Marshal(map[string]any{
		"jsonrpc": "2.0", "id": 1, "method": method, "params": params,
	})
	if err != nil {
		return nil, fmt.Errorf("solana: %s: %w", method, err)
	}

	var lastErr error
	for attempt := 0; attempt <= c.maxRetries; attempt++ {
		start := time.Now()
		if err := c.limiter.wait(ctx, cost); err != nil {
			return nil, err
		}
		waited := time.Since(start)

		c.mu.Lock()
		c.requests++
		c.credits += cost
		c.waited += waited
		if attempt > 0 {
			c.retries++
		}
		c.mu.Unlock()

		raw, retryAfter, err := c.attempt(ctx, method, body)
		if err == nil {
			return raw, nil
		}
		lastErr = err

		var permanent *PermanentError
		if asPermanent(err, &permanent) {
			return nil, err
		}
		if attempt == c.maxRetries {
			break
		}

		delay := backoff(attempt)
		if retryAfter > 0 {
			// The server said how long to wait. Believe it over our own guess,
			// which is the whole point of the header.
			delay = retryAfter
		}
		if err := c.sleep(ctx, delay); err != nil {
			return nil, err
		}
	}
	return nil, fmt.Errorf("solana: %s: gave up after %d attempts: %w", method, c.maxRetries+1, lastErr)
}

// PermanentError marks a failure that retrying cannot fix.
type PermanentError struct{ Err error }

func (e *PermanentError) Error() string { return e.Err.Error() }
func (e *PermanentError) Unwrap() error { return e.Err }

func asPermanent(err error, target **PermanentError) bool {
	for err != nil {
		if p, ok := err.(*PermanentError); ok {
			*target = p
			return true
		}
		type unwrapper interface{ Unwrap() error }
		u, ok := err.(unwrapper)
		if !ok {
			return false
		}
		err = u.Unwrap()
	}
	return false
}

func (c *Client) attempt(ctx context.Context, method string, body []byte) (json.RawMessage, time.Duration, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, 0, &PermanentError{Err: err}
	}
	request.Header.Set("content-type", "application/json")

	response, err := c.http.Do(request)
	if err != nil {
		return nil, 0, err // transport failures are worth retrying
	}
	defer response.Body.Close()

	payload, err := io.ReadAll(response.Body)
	if err != nil {
		return nil, 0, err
	}

	switch {
	case response.StatusCode == http.StatusTooManyRequests:
		return nil, retryAfter(response), fmt.Errorf("rate limited (HTTP 429)")
	case response.StatusCode >= 500:
		return nil, retryAfter(response), fmt.Errorf("HTTP %d: %s", response.StatusCode, truncate(payload))
	case response.StatusCode == http.StatusUnauthorized, response.StatusCode == http.StatusForbidden:
		// A bad credential does not improve with repetition.
		return nil, 0, &PermanentError{Err: fmt.Errorf("HTTP %d: %s", response.StatusCode, truncate(payload))}
	case response.StatusCode != http.StatusOK:
		return nil, 0, &PermanentError{Err: fmt.Errorf("HTTP %d: %s", response.StatusCode, truncate(payload))}
	}

	var parsed rpcResponse
	if err := json.Unmarshal(payload, &parsed); err != nil {
		return nil, 0, &PermanentError{Err: fmt.Errorf("malformed response: %w: %s", err, truncate(payload))}
	}
	if parsed.Error != nil {
		// -32005 is the node's own rate limit reply and is worth retrying;
		// everything else is a request we got wrong.
		if parsed.Error.Code == -32005 {
			return nil, 0, parsed.Error
		}
		return nil, 0, &PermanentError{Err: parsed.Error}
	}
	return parsed.Result, 0, nil
}

func retryAfter(response *http.Response) time.Duration {
	value := response.Header.Get("Retry-After")
	if value == "" {
		return 0
	}
	if seconds, err := strconv.Atoi(value); err == nil && seconds >= 0 {
		return time.Duration(seconds) * time.Second
	}
	if when, err := http.ParseTime(value); err == nil {
		if d := time.Until(when); d > 0 {
			return d
		}
	}
	return 0
}

// backoff grows exponentially with full jitter. Without the jitter, several
// callers throttled at the same moment retry at the same moment, which is how
// a rate limit becomes a thundering herd.
func backoff(attempt int) time.Duration {
	base := time.Duration(1<<uint(attempt)) * 250 * time.Millisecond
	if base > 8*time.Second {
		base = 8 * time.Second
	}
	return time.Duration(rand.Int63n(int64(base)) + int64(base)/2)
}

func truncate(b []byte) string {
	const max = 200
	if len(b) <= max {
		return string(b)
	}
	return string(b[:max]) + "..."
}

// Account is an account as the cluster returned it.
type Account struct {
	Address    string
	Owner      string
	Lamports   uint64
	Data       []byte
	Executable bool
}

type accountValue struct {
	Data       []string `json:"data"`
	Owner      string   `json:"owner"`
	Lamports   uint64   `json:"lamports"`
	Executable bool     `json:"executable"`
}

type contextResult struct {
	Context struct {
		Slot uint64 `json:"slot"`
	} `json:"context"`
	Value json.RawMessage `json:"value"`
}

// GetMultipleAccounts reads accounts, chunking automatically at the RPC's own
// ceiling. A missing account comes back as a nil entry at its index rather than
// being dropped, so the result always lines up with the request.
//
// The returned slot is the one the last chunk was read at. When that matters,
// ask for at most MaxAccountsPerCall so there is only one.
func (c *Client) GetMultipleAccounts(ctx context.Context, addresses []string, commitment string) (uint64, []*Account, error) {
	if commitment == "" {
		commitment = "finalized"
	}
	out := make([]*Account, 0, len(addresses))
	var slot uint64

	for start := 0; start < len(addresses); start += MaxAccountsPerCall {
		end := start + MaxAccountsPerCall
		if end > len(addresses) {
			end = len(addresses)
		}
		chunk := addresses[start:end]

		raw, err := c.Call(ctx, "getMultipleAccounts", []any{chunk, map[string]string{
			"encoding": "base64", "commitment": commitment,
		}})
		if err != nil {
			return 0, nil, err
		}

		var result contextResult
		if err := json.Unmarshal(raw, &result); err != nil {
			return 0, nil, fmt.Errorf("solana: getMultipleAccounts: %w", err)
		}
		slot = result.Context.Slot

		var values []*accountValue
		if err := json.Unmarshal(result.Value, &values); err != nil {
			return 0, nil, fmt.Errorf("solana: getMultipleAccounts: %w", err)
		}
		if len(values) != len(chunk) {
			return 0, nil, fmt.Errorf("solana: asked for %d accounts, got %d", len(chunk), len(values))
		}

		for i, value := range values {
			if value == nil {
				out = append(out, nil)
				continue
			}
			if len(value.Data) == 0 {
				out = append(out, nil)
				continue
			}
			data, err := base64.StdEncoding.DecodeString(value.Data[0])
			if err != nil {
				return 0, nil, fmt.Errorf("solana: %s: %w", chunk[i], err)
			}
			out = append(out, &Account{
				Address: chunk[i], Owner: value.Owner, Lamports: value.Lamports,
				Data: data, Executable: value.Executable,
			})
		}
	}
	return slot, out, nil
}

// GetSlot returns the current slot at a commitment.
func (c *Client) GetSlot(ctx context.Context, commitment string) (uint64, error) {
	if commitment == "" {
		commitment = "finalized"
	}
	raw, err := c.Call(ctx, "getSlot", []any{map[string]string{"commitment": commitment}})
	if err != nil {
		return 0, err
	}
	var slot uint64
	if err := json.Unmarshal(raw, &slot); err != nil {
		return 0, fmt.Errorf("solana: getSlot: %w", err)
	}
	return slot, nil
}
