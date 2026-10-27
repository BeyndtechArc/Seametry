package alert

import (
	"context"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/BeyndtechArc/Seametry/server/internal/store/alertdb"
)

// OptInCount is how many consents a page and first-touch ref code gathered
// in a period; Live false counts those since withdrawn.
type OptInCount struct {
	Live          bool
	Page, RefCode string
	OptIns        int64
}

// MaskedOptIn is a live consent as the Admin shows it: the address is
// masked here, before it leaves the Gateway, so no full address reaches
// the Admin's page, its logs or the web deployment.
type MaskedOptIn struct {
	Address       string
	ConsentedAt   time.Time
	Page, RefCode string
}

type OptInSummary struct {
	Counts []OptInCount
	Recent []MaskedOptIn
}

// Summary reads the consents given in [from, to) in one deployment.
func (o *OptIns) Summary(ctx context.Context, from, to time.Time, deployment string) (OptInSummary, error) {
	counts, err := o.q.AdminOptInCounts(ctx, alertdb.AdminOptInCountsParams{
		Deployment: deployment, PeriodFrom: pgtype.Timestamptz{Time: from, Valid: true}, PeriodTo: pgtype.Timestamptz{Time: to, Valid: true},
	})
	if err != nil {
		return OptInSummary{}, fmt.Errorf("alert: counting email opt-ins: %w", err)
	}
	recent, err := o.q.AdminRecentOptIns(ctx, alertdb.AdminRecentOptInsParams{
		Deployment: deployment, PeriodFrom: pgtype.Timestamptz{Time: from, Valid: true}, PeriodTo: pgtype.Timestamptz{Time: to, Valid: true},
	})
	if err != nil {
		return OptInSummary{}, fmt.Errorf("alert: reading recent email opt-ins: %w", err)
	}
	summary := OptInSummary{Counts: make([]OptInCount, 0, len(counts)), Recent: make([]MaskedOptIn, 0, len(recent))}
	for _, row := range counts {
		summary.Counts = append(summary.Counts, OptInCount{Live: row.Live, Page: row.Page, RefCode: row.RefCode, OptIns: row.Optins})
	}
	for _, row := range recent {
		summary.Recent = append(summary.Recent, MaskedOptIn{Address: MaskAddress(row.Address), ConsentedAt: row.ConsentedAt.Time, Page: row.Page, RefCode: row.RefCode})
	}
	return summary, nil
}

// MaskAddress keeps the first character of the local part and of the
// domain, and the last label, enough to tell two consents apart at a glance
// and not enough to write to either: storm@gmail.com is s***@g***.com.
func MaskAddress(address string) string {
	at := strings.LastIndexByte(address, '@')
	if at < 1 || at == len(address)-1 {
		return "***"
	}
	local, domain := address[:at], address[at+1:]
	dot := strings.LastIndexByte(domain, '.')
	if dot < 1 || dot == len(domain)-1 {
		return first(local) + "***@***"
	}
	return first(local) + "***@" + first(domain) + "***" + domain[dot:]
}

func first(text string) string {
	_, size := utf8.DecodeRuneInString(text)
	return text[:size]
}
