package growth

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/BeyndtechArc/Seametry/server/internal/store/growthdb"
)

// The shapes growth.visit_counts holds (migrations/growth/00003): a path on
// the site, and a referral code as clients/web/src/lib/ref-link.ts records
// it, or none.
var (
	landingPathShape = regexp.MustCompile(`^/[A-Za-z0-9/_.-]{0,199}$`)
	refCodeShape     = regexp.MustCompile(`^([a-z0-9][a-z0-9_-]{0,39})?$`)
)

// ErrVisitShape is a visit whose path or code the count does not hold. The
// message names the field and its shape, never the value: it is text a
// visitor's browser sent.
var ErrVisitShape = errors.New("growth: visit refused")

// Visits counts browser sessions by day, landing page and referral code,
// and nothing else: no identifier, address or wallet is taken or kept.
type Visits struct {
	q *growthdb.Queries
}

func NewVisits(db growthdb.DBTX) *Visits {
	return &Visits{q: growthdb.New(db)}
}

// VisitCount is one day's sessions for one page and code. An empty
// RefCode counts the sessions that arrived without one.
type VisitCount struct {
	Day         time.Time
	LandingPath string
	RefCode     string
	Count       int64
}

// Count adds one entry to the count for its day (UTC), page and code. A
// dm-<handle> code names the person a message went to, so it is counted as
// its channel, dm; the web report already sends it that way.
func (v *Visits) Count(ctx context.Context, at time.Time, landingPath, refCode string) error {
	if !landingPathShape.MatchString(landingPath) {
		return fmt.Errorf("%w: landing_path must be a site path of 1 to 200 letters, digits and / _ . -, starting with /", ErrVisitShape)
	}
	if !refCodeShape.MatchString(refCode) {
		return fmt.Errorf("%w: ref_code must be empty or a lowercase code of at most 40 letters, digits, _ and -", ErrVisitShape)
	}
	if strings.HasPrefix(refCode, "dm-") {
		refCode = "dm"
	}
	day := at.UTC()
	if err := v.q.CountVisit(ctx, growthdb.CountVisitParams{
		Day: pgtype.Date{Time: time.Date(day.Year(), day.Month(), day.Day(), 0, 0, 0, 0, time.UTC), Valid: true}, LandingPath: landingPath, RefCode: refCode,
	}); err != nil {
		return fmt.Errorf("growth: counting a visit to %s on %s: %w", landingPath, day.Format(time.DateOnly), err)
	}
	return nil
}

// Counts answers every count from one day to another, inclusive.
func (v *Visits) Counts(ctx context.Context, from, to time.Time) ([]VisitCount, error) {
	rows, err := v.q.VisitCounts(ctx, growthdb.VisitCountsParams{
		FromDay: pgtype.Date{Time: from.UTC(), Valid: true}, ToDay: pgtype.Date{Time: to.UTC(), Valid: true},
	})
	if err != nil {
		return nil, fmt.Errorf("growth: reading visit counts from %s to %s: %w", from.Format(time.DateOnly), to.Format(time.DateOnly), err)
	}
	counts := make([]VisitCount, len(rows))
	for i, row := range rows {
		counts[i] = VisitCount{Day: row.Day.Time, LandingPath: row.LandingPath, RefCode: row.RefCode, Count: row.Count}
	}
	return counts, nil
}
