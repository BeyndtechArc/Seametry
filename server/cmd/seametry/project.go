package main

import (
	"context"
	"log/slog"
	"time"

	"github.com/BeyndtechArc/Seametry/server/internal/growth"
)

// projectEvery is how often Growth reads the execution outbox. A projection
// reads its own database and no outside service, so the cadence costs
// nothing against any provider's limits.
const projectEvery = 15 * time.Second

// hallEvery is how often Growth reads the Hall program's history. Each pass
// costs one getSignaturesForAddress and one getTransaction per new
// transaction, against the same RPC the Gateway reads Alloys from; the
// public devnet endpoint refused rapid getTransaction calls with 429 when
// this was written, so a pass stays small and frequent rather than large.
const hallEvery = time.Minute

// readHallActivity keeps Growth's chain events up with the Hall program. A
// failed pass is logged and the next resumes from the stored signature.
func readHallActivity(ctx context.Context, events *growth.Events, chain growth.HallChain, programID, cluster string) {
	ticker := time.NewTicker(hallEvery)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
		written, err := events.ReadHall(ctx, chain, programID, cluster, time.Now())
		if err != nil {
			slog.Warn("seametry: reading the Hall's history", "cluster", cluster, "error", err.Error())
		}
		if written > 0 {
			slog.Info("seametry: read Hall events", "cluster", cluster, "count", written)
		}
	}
}

// project keeps Growth's timeline up with the execution outbox, and deletes
// projected funnel steps with the funnel's own retention. A failed pass is
// logged and the next one resumes from the stored cursor; nothing it does
// can stop a trade.
func project(ctx context.Context, events *growth.Events, outbox growth.Outbox) {
	ticker := time.NewTicker(projectEvery)
	defer ticker.Stop()
	var forgotten time.Time
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
		now := time.Now()
		written, err := events.Project(ctx, outbox, now)
		if err != nil {
			slog.Warn("seametry: projecting the execution outbox", "error", err.Error())
		} else if written > 0 {
			slog.Info("seametry: projected events", "count", written)
		}
		if now.Sub(forgotten) >= 24*time.Hour {
			deleted, err := events.ForgetFunnelBefore(ctx, now.AddDate(0, -funnelRetention, 0))
			if err != nil {
				slog.Warn("seametry: deleting expired projected funnel steps", "error", err.Error())
			} else {
				forgotten = now
				if deleted > 0 {
					slog.Info("seametry: deleted expired projected funnel steps", "count", deleted)
				}
			}
		}
	}
}
