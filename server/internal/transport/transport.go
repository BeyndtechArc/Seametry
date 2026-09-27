// Package transport is how Seametry talks to any rate limited HTTP service.
//
// It owns four things so that no caller has to remember them: pacing requests
// before they go out rather than discovering a limit from a 429, counting cost
// in the provider's own units because those are the real budget, retrying only
// what is safe to repeat with bounded jittered backoff, and obeying a
// Retry-After header over any guess of ours.
//
// Callers describe a request and how to judge its response. They never sleep,
// count, or decide whether to retry.
package transport

import (
	"context"
	"errors"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"strconv"
	"sync"
	"time"
)

// PermanentError marks a failure that repeating the request cannot fix.
type PermanentError struct{ Err error }

func (e *PermanentError) Error() string { return e.Err.Error() }
func (e *PermanentError) Unwrap() error { return e.Err }

// RetryableError marks a failure worth repeating. RetryAfter, when set, is the
// delay the server asked for and overrides our own backoff.
type RetryableError struct {
	Err        error
	RetryAfter time.Duration
}

func (e *RetryableError) Error() string { return e.Err.Error() }
func (e *RetryableError) Unwrap() error { return e.Err }

// Options configure a Client. The zero value is conservative and usable.
type Options struct {
	// RequestsPerSecond defaults to 8, under the 10 that common free tiers
	// advertise, because an advertised limit is where requests start failing
	// rather than a rate to sit on.
	RequestsPerSecond float64
	Burst             int
	MaxRetries        int
	Timeout           time.Duration
	HTTPClient        *http.Client

	// Clock and Sleep are injectable so tests assert the arithmetic of pacing
	// and backoff without waiting for either.
	Clock func() time.Time
	Sleep func(context.Context, time.Duration) error
}

// Usage is what a client has spent.
type Usage struct {
	Requests int
	Cost     float64
	Retries  int
	// Waited is time held back by the limiter, the honest measure of whether
	// the configured rate is the binding constraint.
	Waited time.Duration
}

func (u Usage) String() string {
	return fmt.Sprintf("%d requests, %.0f cost, %d retries, %s held by the rate limiter",
		u.Requests, u.Cost, u.Retries, u.Waited.Round(time.Millisecond))
}

// Client is safe for concurrent use.
type Client struct {
	http       *http.Client
	limiter    *Limiter
	maxRetries int
	sleep      func(context.Context, time.Duration) error

	mu    sync.Mutex
	usage Usage
}

// New builds a Client.
func New(opts Options) *Client {
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
	if opts.HTTPClient == nil {
		opts.HTTPClient = &http.Client{Timeout: opts.Timeout}
	}
	if opts.Sleep == nil {
		opts.Sleep = sleepContext
	}
	return &Client{
		http:       opts.HTTPClient,
		limiter:    NewLimiter(opts.RequestsPerSecond, opts.Burst, opts.Clock),
		maxRetries: opts.MaxRetries,
		sleep:      opts.Sleep,
	}
}

// Usage returns a snapshot.
func (c *Client) Usage() Usage {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.usage
}

// Do sends the request built by build, spending cost against the limiter.
//
// check judges a 200 response body. It returns nil to accept, a
// *RetryableError to try again, or any other error to stop. That is how a
// service that reports failure inside a successful HTTP response, as JSON-RPC
// does, gets the same retry treatment as one that reports it in the status.
func (c *Client) Do(ctx context.Context, cost float64, build func() (*http.Request, error), check func([]byte) error) ([]byte, error) {
	var last error
	for attempt := 0; attempt <= c.maxRetries; attempt++ {
		waited, err := c.limiter.Wait(ctx, cost)
		if err != nil {
			return nil, err
		}
		c.record(cost, waited, attempt)

		body, err := c.once(build, check)
		if err == nil {
			return body, nil
		}
		last = err

		var permanent *PermanentError
		if errors.As(err, &permanent) {
			return nil, err
		}
		if attempt == c.maxRetries {
			break
		}

		delay := backoff(attempt)
		var retry *RetryableError
		if errors.As(err, &retry) && retry.RetryAfter > 0 {
			delay = retry.RetryAfter
		}
		if err := c.sleep(ctx, delay); err != nil {
			return nil, err
		}
	}
	return nil, fmt.Errorf("gave up after %d attempts: %w", c.maxRetries+1, last)
}

func (c *Client) record(cost float64, waited time.Duration, attempt int) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.usage.Requests++
	c.usage.Cost += cost
	c.usage.Waited += waited
	if attempt > 0 {
		c.usage.Retries++
	}
}

func (c *Client) once(build func() (*http.Request, error), check func([]byte) error) ([]byte, error) {
	request, err := build()
	if err != nil {
		return nil, &PermanentError{Err: err}
	}
	response, err := c.http.Do(request)
	if err != nil {
		return nil, &RetryableError{Err: err}
	}
	defer response.Body.Close()

	body, err := io.ReadAll(response.Body)
	if err != nil {
		return nil, &RetryableError{Err: err}
	}

	switch {
	case response.StatusCode == http.StatusTooManyRequests:
		return nil, &RetryableError{Err: errors.New("rate limited (HTTP 429)"), RetryAfter: retryAfter(response)}
	case response.StatusCode >= 500:
		return nil, &RetryableError{Err: &StatusError{Code: response.StatusCode, Body: body}, RetryAfter: retryAfter(response)}
	case response.StatusCode != http.StatusOK:
		// 401 and 403 are a bad credential, which does not improve with
		// repetition. Every other 4xx is a request we got wrong.
		return nil, &PermanentError{Err: &StatusError{Code: response.StatusCode, Body: body}}
	}

	if check != nil {
		if err := check(body); err != nil {
			return nil, err
		}
	}
	return body, nil
}

// StatusError is a non-200 response, kept whole so a caller can read the body.
// A service may report a fact about the thing asked about through an error
// status, as Jupiter does with NO_ROUTES_FOUND, and that is information rather
// than a fault.
type StatusError struct {
	Code int
	Body []byte
}

func (e *StatusError) Error() string {
	const limit = 200
	text := string(e.Body)
	if len(text) > limit {
		text = text[:limit] + "..."
	}
	return fmt.Sprintf("HTTP %d: %s", e.Code, text)
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

// backoff grows exponentially with full jitter. Without jitter, several
// callers throttled at the same moment retry at the same moment, which is how a
// rate limit becomes a thundering herd.
func backoff(attempt int) time.Duration {
	base := time.Duration(1<<uint(attempt)) * 250 * time.Millisecond
	if base > 8*time.Second {
		base = 8 * time.Second
	}
	return time.Duration(rand.Int63n(int64(base)) + int64(base)/2)
}

func sleepContext(ctx context.Context, d time.Duration) error {
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}
