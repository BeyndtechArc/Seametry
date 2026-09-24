package transport

import (
	"context"
	"sync"
	"time"
)

// Limiter is a token bucket.
//
// Burst matters as much as rate. A provider advertising ten requests a second
// rarely means ten evenly spaced ones, and refusing to burst would make a batch
// slower while using no fewer credits.
type Limiter struct {
	mu sync.Mutex

	perSecond float64
	burst     float64
	tokens    float64
	last      time.Time
	now       func() time.Time
}

// NewLimiter returns a limiter that refills perSecond tokens a second up to
// burst. A nil clock means time.Now.
func NewLimiter(perSecond float64, burst int, clock func() time.Time) *Limiter {
	if perSecond <= 0 {
		perSecond = 1
	}
	if burst < 1 {
		burst = 1
	}
	if clock == nil {
		clock = time.Now
	}
	return &Limiter{perSecond: perSecond, burst: float64(burst), tokens: float64(burst), now: clock}
}

// Reserve consumes cost tokens and returns how long the caller must wait before
// sending. Zero means go now.
func (l *Limiter) Reserve(cost float64) time.Duration {
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
	// A negative balance is a debt repaid at the fill rate. Recording it rather
	// than clamping is what lets a burst borrow from the future instead of
	// being silently dropped.
	return time.Duration(-l.tokens / l.perSecond * float64(time.Second))
}

// Wait blocks until the request may go out, or the context ends. It returns the
// delay the limiter imposed, which is the honest measure of how much the
// configured rate is holding a caller back.
func (l *Limiter) Wait(ctx context.Context, cost float64) (time.Duration, error) {
	delay := l.Reserve(cost)
	if delay <= 0 {
		return 0, ctx.Err()
	}
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return 0, ctx.Err()
	case <-timer.C:
		return delay, nil
	}
}
