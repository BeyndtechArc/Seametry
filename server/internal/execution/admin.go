package execution

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/BeyndtechArc/Seametry/server/internal/store/executiondb"
)

// Deployments a period may read. Preview and development trades are kept
// apart so test trades never reach production figures.
var Deployments = map[string]bool{"production": true, "preview": true, "development": true}

// MaxAdminPeriod bounds one read, so a mistyped range cannot scan years.
const MaxAdminPeriod = 366 * 24 * time.Hour

// Period is the half-open range [From, To) the Admin reads, in one deployment.
type Period struct {
	From, To   time.Time
	Deployment string
}

// Check refuses a deployment outside the known three, an empty or reversed
// range, and one longer than MaxAdminPeriod.
func (p Period) Check() error {
	if !Deployments[p.Deployment] {
		return Invalid{fmt.Sprintf("deployment %q is not production, preview or development", p.Deployment)}
	}
	if !p.From.Before(p.To) {
		return Invalid{fmt.Sprintf("period from %s is not before to %s", p.From.UTC().Format(time.RFC3339), p.To.UTC().Format(time.RFC3339))}
	}
	if p.To.Sub(p.From) > MaxAdminPeriod {
		return Invalid{fmt.Sprintf("period from %s to %s is longer than %d days", p.From.UTC().Format(time.RFC3339), p.To.UTC().Format(time.RFC3339), int(MaxAdminPeriod.Hours()/24))}
	}
	return nil
}

func timestamp(at time.Time) pgtype.Timestamptz {
	return pgtype.Timestamptz{Time: at, Valid: true}
}

// Overview carries every Overview figure for a period. Amounts are USDC
// atoms at scale 6 as decimal digits; each definition is docs/prd/ADMIN.md's.
type Overview struct {
	VolumeAtoms, FeeAtoms, TipCostAtoms string
	LandedLegs                          int64
	SeenWallets                         int64
	// SeenAndActivatedWallets are the wallets seen in the period that had a
	// landed leg by its end: conversion is this over SeenWallets.
	SeenAndActivatedWallets int64
	ActivatedWallets        int64
	ActiveWallets           int64
	ReturningWallets        int64
	// LastReconciledAt is when the reconciler last wrote a chain answer,
	// for any deployment: how old the chain-measured figures can be.
	LastReconciledAt *time.Time
	Funnel           Funnel
	Refusals         []RefusalCount
	Reliability      []Reliability
}

type Funnel struct {
	Requested, Prepared, Refused                                         int64
	ReviewOpened, SignatureRequested, SignatureDeclined, SignatureFailed int64
	SheetAbandoned, Sent, Landed                                         int64
}

type RefusalCount struct {
	Status int
	Quotes int64
}

type Reliability struct {
	Landing                                   string
	Sent, Landed, Failed, Dropped, Unanswered int64
}

func (r *Report) Overview(ctx context.Context, period Period) (Overview, error) {
	if err := period.Check(); err != nil {
		return Overview{}, err
	}
	from, to := timestamp(period.From), timestamp(period.To)
	row, err := r.q.AdminOverview(ctx, executiondb.AdminOverviewParams{Deployment: period.Deployment, PeriodFrom: from, PeriodTo: to})
	if err != nil {
		return Overview{}, fmt.Errorf("execution: reading the overview: %w", err)
	}
	overview := Overview{
		VolumeAtoms: atoms(row.VolumeAtoms), FeeAtoms: atoms(row.FeeAtoms), TipCostAtoms: atoms(row.TipCostAtoms),
		LandedLegs: row.LandedLegs, SeenWallets: row.SeenWallets, SeenAndActivatedWallets: row.SeenAndActivatedWallets,
		ActivatedWallets: row.ActivatedWallets, ActiveWallets: row.ActiveWallets, ReturningWallets: row.ReturningWallets,
	}
	if row.LastReconciledAt.Valid {
		overview.LastReconciledAt = &row.LastReconciledAt.Time
	}
	funnel, err := r.q.AdminFunnel(ctx, executiondb.AdminFunnelParams{Deployment: period.Deployment, PeriodFrom: from, PeriodTo: to})
	if err != nil {
		return Overview{}, fmt.Errorf("execution: reading the funnel: %w", err)
	}
	overview.Funnel = Funnel(funnel)
	refusals, err := r.q.AdminRefusals(ctx, executiondb.AdminRefusalsParams{Deployment: period.Deployment, PeriodFrom: from, PeriodTo: to})
	if err != nil {
		return Overview{}, fmt.Errorf("execution: reading refusals: %w", err)
	}
	overview.Refusals = make([]RefusalCount, 0, len(refusals))
	for _, refusal := range refusals {
		overview.Refusals = append(overview.Refusals, RefusalCount{Status: int(refusal.Status), Quotes: refusal.Quotes})
	}
	paths, err := r.q.AdminReliability(ctx, executiondb.AdminReliabilityParams{Deployment: period.Deployment, PeriodFrom: from, PeriodTo: to})
	if err != nil {
		return Overview{}, fmt.Errorf("execution: reading reliability: %w", err)
	}
	overview.Reliability = make([]Reliability, 0, len(paths))
	for _, path := range paths {
		overview.Reliability = append(overview.Reliability, Reliability(path))
	}
	return overview, nil
}

// SourceTotals are one first-touch ref code's wallets and landed volume in
// a period; Source is "unknown" for wallets whose first quote carried none.
type SourceTotals struct {
	Source                                       string
	SeenWallets, ActivatedWallets, ActiveWallets int64
	VolumeAtoms, FeeAtoms                        string
}

func (r *Report) Sources(ctx context.Context, period Period) ([]SourceTotals, error) {
	if err := period.Check(); err != nil {
		return nil, err
	}
	rows, err := r.q.AdminSources(ctx, executiondb.AdminSourcesParams{Deployment: period.Deployment, PeriodFrom: timestamp(period.From), PeriodTo: timestamp(period.To)})
	if err != nil {
		return nil, fmt.Errorf("execution: reading sources: %w", err)
	}
	sources := make([]SourceTotals, 0, len(rows))
	for _, row := range rows {
		sources = append(sources, SourceTotals{
			Source: row.Source, SeenWallets: row.SeenWallets, ActivatedWallets: row.ActivatedWallets, ActiveWallets: row.ActiveWallets,
			VolumeAtoms: atoms(row.VolumeAtoms), FeeAtoms: atoms(row.FeeAtoms),
		})
	}
	return sources, nil
}

type WalletTotals struct {
	Address               string
	FirstSeenAt           time.Time
	Source                string
	Quotes, LandedLegs    int64
	VolumeAtoms, FeeAtoms string
}

// MaxWalletPage bounds one read of the wallet list, the contract's maximum.
const MaxWalletPage = 200

// WalletCursor is where a page of wallets ends: the last row's first quote
// and address, the list's order.
type WalletCursor struct {
	FirstSeenAt time.Time
	Address     string
}

// WalletPage is one page of the all-time wallet list. Total counts every
// wallet in the deployment, and Next is set while older ones remain.
type WalletPage struct {
	Wallets []WalletTotals
	Total   int64
	Next    *WalletCursor
}

// Wallets are the wallets seen in a deployment, newest first, with all-time
// totals: a wallet list is read by page, not by period.
func (r *Report) Wallets(ctx context.Context, deployment string, after *WalletCursor, limit int) (WalletPage, error) {
	if !Deployments[deployment] {
		return WalletPage{}, Invalid{fmt.Sprintf("deployment %q is not production, preview or development", deployment)}
	}
	if limit < 1 || limit > MaxWalletPage {
		return WalletPage{}, Invalid{fmt.Sprintf("a page of %d wallets is not between 1 and %d", limit, MaxWalletPage)}
	}
	// One row past the limit says whether another page follows without a
	// second query.
	params := executiondb.AdminWalletsParams{Deployment: deployment, PageLimit: int32(limit + 1)}
	if after != nil {
		params.AfterAt = pgtype.Timestamptz{Time: after.FirstSeenAt, Valid: true}
		params.AfterWallet = pgtype.Text{String: after.Address, Valid: true}
	}
	rows, err := r.q.AdminWallets(ctx, params)
	if err != nil {
		return WalletPage{}, fmt.Errorf("execution: reading wallets: %w", err)
	}
	total, err := r.q.AdminWalletCount(ctx, deployment)
	if err != nil {
		return WalletPage{}, fmt.Errorf("execution: counting wallets: %w", err)
	}
	page := WalletPage{Total: total}
	if len(rows) > limit {
		rows = rows[:limit]
		last := rows[limit-1]
		page.Next = &WalletCursor{FirstSeenAt: last.FirstSeenAt.Time, Address: last.Address}
	}
	wallets := make([]WalletTotals, 0, len(rows))
	for _, row := range rows {
		wallets = append(wallets, WalletTotals{
			Address: row.Address, FirstSeenAt: row.FirstSeenAt.Time, Source: row.Source, Quotes: row.Quotes, LandedLegs: row.LandedLegs,
			VolumeAtoms: atoms(row.VolumeAtoms), FeeAtoms: atoms(row.FeeAtoms),
		})
	}
	page.Wallets = wallets
	return page, nil
}

// RecordedRow is one row of the record as written: Source says whose word
// it is (server, client or chain), and only a chain row with Event
// "landed" says something settled.
type RecordedRow struct {
	At                            time.Time
	Source, Event, Wallet, Detail string
}

func (r *Report) RecentActivity(ctx context.Context, period Period) ([]RecordedRow, error) {
	if err := period.Check(); err != nil {
		return nil, err
	}
	rows, err := r.q.AdminRecentActivity(ctx, executiondb.AdminRecentActivityParams{Deployment: period.Deployment, PeriodTo: timestamp(period.To)})
	if err != nil {
		return nil, fmt.Errorf("execution: reading recent activity: %w", err)
	}
	recorded := make([]RecordedRow, 0, len(rows))
	for _, row := range rows {
		recorded = append(recorded, RecordedRow{At: row.At.Time, Source: row.Source, Event: row.Event, Wallet: row.Wallet, Detail: row.Detail})
	}
	return recorded, nil
}
