package solana

import (
	"context"
	"sync"
	"time"
)

// limiter is a token bucket.
//
// Written here rather than taken as a dependency: it is forty lines, the
// behaviour has to be exactly understood to reason about a credit budget, and
// a dependency would have to be justified under the engineering standard for
// something this size.
//
// Burst matters as much as rate. A provider advertising ten requests per
// second does not usually mean ten evenly spaced ones, and refusing to burst
// would make a batch of account reads slower than it needs to be while using
// no fewer credits.
type limiter struct {
	mu sync.Mutex

	perSecond float64
	burst     float64

	tokens float64
	last   time.Time

	// now is injectable so tests do not sleep. Nothing else touches it.
	now func() time.Time
}

func newLimiter(perSecond float64, burst int) *limiter {
	if perSecond <= 0 {
		perSecond = 1
	}
	if burst < 1 {
		burst = 1
	}
	return &limiter{
		perSecond: perSecond,
		burst:     float64(burst),
		tokens:    float64(burst),
		now:       time.Now,
	}
}

// reserve returns how long the caller must wait before its request may go out,
// and consumes the tokens for it. A zero duration means go now.
func (l *limiter) reserve(cost float64) time.Duration {
	if cost < 1 {
		cost = 1
	}
	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.now()
	if l.last.IsZero() {
		l.last = now
	}
	l.tokens += now.Sub(l.last).Seconds() * l.perSecond
	if l.tokens > l.burst {
		l.tokens = l.burst
	}
	l.last = now

	l.tokens -= cost
	if l.tokens >= 0 {
		return 0
	}
	// Negative tokens are a debt, repaid at the fill rate. Recording the debt
	// rather than clamping is what makes a burst borrow from the future
	// instead of being silently dropped.
	return time.Duration(-l.tokens / l.perSecond * float64(time.Second))
}

// wait blocks until the request may go out, or the context ends first.
func (l *limiter) wait(ctx context.Context, cost float64) error {
	delay := l.reserve(cost)
	if delay <= 0 {
		return ctx.Err()
	}
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}
