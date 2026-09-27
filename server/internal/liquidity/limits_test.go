package liquidity

import "testing"

// A token bucket sends at most burst + rate*T requests in any interval T. If
// the defaults permit more than the measured quota in one window the client
// will be refused, and it was: the first live run used a burst of 8 at 0.9 a
// second, which allows 17 in ten seconds against a quota of ten.
func TestDefaultsCannotExceedTheMeasuredQuota(t *testing.T) {
	worst := float64(defaultBurst) + defaultRate*measuredWindow.Seconds()
	if worst > measuredQuota {
		t.Fatalf("the defaults permit %.1f requests in a %s window, above the measured quota of %d",
			worst, measuredWindow, measuredQuota)
	}
}
