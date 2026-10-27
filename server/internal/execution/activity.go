// Package execution owns the activity record (docs/SERVICE_CATALOG.md
// section 3.6): what Seametry quoted, refused and sent for every wallet that
// used it, and the funnel steps a browser reports. It writes only the
// execution schema. What landed on chain is recorded by the reconciler,
// which is not built yet (.plan/activity-record-and-admin.plan.md).
package execution

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"regexp"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/BeyndtechArc/Seametry/server/internal/base58"
	"github.com/BeyndtechArc/Seametry/server/internal/store/executiondb"
)

// FunnelKinds are the steps a browser may report. Anything else is kept as
// "unrecognised" beside the kind that was sent.
var FunnelKinds = map[string]bool{
	"wallet_connected":    true,
	"review_opened":       true,
	"signature_requested": true,
	"signature_declined":  true,
	"signature_failed":    true,
	"sheet_abandoned":     true,
}

// Report is the activity record's writer. *pgxpool.Pool satisfies db.
type Report struct {
	db beginner
	q  *executiondb.Queries
}

type beginner interface {
	executiondb.DBTX
	Begin(ctx context.Context) (pgx.Tx, error)
}

func NewReport(db beginner) *Report {
	return &Report{db: db, q: executiondb.New(db)}
}

// Invalid is a report the record refuses as written. Its message names the
// field, the value's problem and what was expected, for the sender's log.
type Invalid struct{ Reason string }

func (e Invalid) Error() string { return "execution: " + e.Reason }

// ErrUnknownLeg answers a submission whose message digest no recorded leg
// carries: its quote report was lost, or never sent.
var ErrUnknownLeg = errors.New("execution: no recorded leg carries this message digest")

type FirstTouch struct {
	ReferrerHost string `json:"referrer_host,omitempty"`
	LandingPath  string `json:"landing_path,omitempty"`
	UTMSource    string `json:"utm_source,omitempty"`
	UTMMedium    string `json:"utm_medium,omitempty"`
	UTMCampaign  string `json:"utm_campaign,omitempty"`
	UTMContent   string `json:"utm_content,omitempty"`
	UTMTerm      string `json:"utm_term,omitempty"`
	RefCode      string `json:"ref_code,omitempty"`
}

type Amount struct {
	Atoms string
	Scale int
}

type Leg struct {
	ID                   [16]byte
	Mint                 string
	Symbol               string
	In, Out, Floor       Amount
	RoutingFeeBps        int
	TipOffsetBps         int
	SimulatedFeeAtoms    string
	TipLamports          string
	Landing              string
	LastValidBlockHeight int64
	MessageSHA256        string
}

type Refusal struct {
	Status int
	Text   string
}

type Quote struct {
	ID         [16]byte
	Wallet     string
	Network    string
	Kind       string
	Subject    string
	TemplateID string
	PlanSize   int
	Deployment string
	PreparedAt time.Time
	Refusal    *Refusal
	FirstTouch *FirstTouch
	Legs       []Leg
}

type Submission struct {
	MessageSHA256 string
	Signature     string
	SubmittedAt   time.Time
	Result        string
	Text          string
}

type FunnelEvent struct {
	Kind    string
	Wallet  string
	QuoteID *[16]byte
}

var (
	digestPattern    = regexp.MustCompile(`^[0-9a-f]{64}$`)
	signaturePattern = regexp.MustCompile(`^[1-9A-HJ-NP-Za-km-z]{64,88}$`)
	unsignedAtoms    = regexp.MustCompile(`^[0-9]{1,20}$`)
	signedAtoms      = regexp.MustCompile(`^-?[0-9]{1,20}$`)
	deployments      = map[string]bool{"production": true, "preview": true, "development": true}
)

func address(field, value string) error {
	decoded, err := base58.Decode(value)
	if err != nil || len(decoded) != 32 {
		return Invalid{fmt.Sprintf("%s %q is not a 32-byte base58 Solana address", field, value)}
	}
	return nil
}

func capped(field, value string, limit int) error {
	if utf8.RuneCountInString(value) > limit {
		return Invalid{fmt.Sprintf("%s is %d characters; at most %d are kept", field, utf8.RuneCountInString(value), limit)}
	}
	return nil
}

func numeric(field, value string, pattern *regexp.Regexp) (pgtype.Numeric, error) {
	if !pattern.MatchString(value) {
		return pgtype.Numeric{}, Invalid{fmt.Sprintf("%s %q is not an integer count of atoms", field, value)}
	}
	n, _ := new(big.Int).SetString(value, 10)
	return pgtype.Numeric{Int: n, Valid: true}, nil
}

func (a Amount) check(field string) (pgtype.Numeric, int16, error) {
	n, err := numeric(field+".atoms", a.Atoms, unsignedAtoms)
	if err != nil {
		return n, 0, err
	}
	if a.Scale < 0 || a.Scale > 18 {
		return n, 0, Invalid{fmt.Sprintf("%s.scale %d is outside 0 to 18", field, a.Scale)}
	}
	return n, int16(a.Scale), nil
}

func optionalText(value string) pgtype.Text {
	return pgtype.Text{String: value, Valid: value != ""}
}

func (f *FirstTouch) check() error {
	for field, value := range map[string]string{"referrer_host": f.ReferrerHost, "utm_source": f.UTMSource, "utm_medium": f.UTMMedium, "utm_campaign": f.UTMCampaign, "utm_content": f.UTMContent, "utm_term": f.UTMTerm} {
		limit := 200
		if field == "referrer_host" {
			limit = 255
		}
		if err := capped("first_touch."+field, value, limit); err != nil {
			return err
		}
	}
	if err := capped("first_touch.ref_code", f.RefCode, 40); err != nil {
		return err
	}
	return capped("first_touch.landing_path", f.LandingPath, 500)
}

func (q Quote) check() error {
	if err := address("wallet", q.Wallet); err != nil {
		return err
	}
	if q.Network != "mainnet" && q.Network != "devnet" {
		return Invalid{fmt.Sprintf("network %q is not mainnet or devnet", q.Network)}
	}
	if q.Kind != "buy" && q.Kind != "sell" {
		return Invalid{fmt.Sprintf("kind %q is not buy or sell", q.Kind)}
	}
	if !deployments[q.Deployment] {
		return Invalid{fmt.Sprintf("deployment %q is not production, preview or development", q.Deployment)}
	}
	if q.PlanSize < 1 {
		return Invalid{fmt.Sprintf("plan_size %d is below 1", q.PlanSize)}
	}
	if err := capped("subject", q.Subject, 200); err != nil {
		return err
	}
	if err := capped("template_id", q.TemplateID, 200); err != nil {
		return err
	}
	if q.PreparedAt.IsZero() {
		return Invalid{"prepared_at is missing"}
	}
	if q.FirstTouch != nil {
		if err := q.FirstTouch.check(); err != nil {
			return err
		}
	}
	if q.Refusal != nil {
		if q.Refusal.Status < 400 || q.Refusal.Status > 599 {
			return Invalid{fmt.Sprintf("refusal.status %d is not an HTTP error status", q.Refusal.Status)}
		}
		if len(q.Legs) > 0 {
			return Invalid{fmt.Sprintf("a refused quote carries %d legs; a refusal returns none", len(q.Legs))}
		}
		return capped("refusal.text", q.Refusal.Text, 2000)
	}
	if len(q.Legs) == 0 {
		return Invalid{"a prepared quote carries no legs"}
	}
	return nil
}

// RecordQuote writes a prepare request: its wallet, the quote, and each leg,
// together or not at all. A quote id already recorded changes nothing, so a
// retried report is harmless.
func (r *Report) RecordQuote(ctx context.Context, quote Quote) (err error) {
	if err := quote.check(); err != nil {
		return err
	}
	var source []byte
	if quote.FirstTouch != nil && *quote.FirstTouch != (FirstTouch{}) {
		if source, err = json.Marshal(quote.FirstTouch); err != nil {
			return fmt.Errorf("execution: encoding the first-touch source: %w", err)
		}
	}
	legs := make([]executiondb.InsertLegParams, 0, len(quote.Legs))
	for index, leg := range quote.Legs {
		params, err := leg.params(index, quote)
		if err != nil {
			return err
		}
		legs = append(legs, params)
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("execution: opening the quote transaction: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback(ctx)
		}
	}()
	q := r.q.WithTx(tx)
	seen := pgtype.Timestamptz{Time: quote.PreparedAt.UTC(), Valid: true}
	if err = q.TouchWallet(ctx, executiondb.TouchWalletParams{Address: quote.Wallet, SeenAt: seen, FirstSource: source}); err != nil {
		return fmt.Errorf("execution: recording wallet %s: %w", quote.Wallet, err)
	}
	refusal := Refusal{}
	outcome := "prepared"
	if quote.Refusal != nil {
		refusal, outcome = *quote.Refusal, "refused"
	}
	inserted, err := q.InsertQuote(ctx, executiondb.InsertQuoteParams{
		ID: pgtype.UUID{Bytes: quote.ID, Valid: true}, Wallet: quote.Wallet, Network: quote.Network, Kind: quote.Kind,
		Subject: optionalText(quote.Subject), TemplateID: optionalText(quote.TemplateID), PlanSize: int32(quote.PlanSize),
		Deployment: quote.Deployment, PreparedAt: seen, Outcome: outcome,
		RefusalStatus: pgtype.Int4{Int32: int32(refusal.Status), Valid: quote.Refusal != nil}, RefusalText: optionalText(refusal.Text),
		Source: "server",
	})
	if err != nil {
		return fmt.Errorf("execution: recording quote for %s: %w", quote.Wallet, err)
	}
	if inserted == 1 {
		for _, leg := range legs {
			if err = q.InsertLeg(ctx, leg); err != nil {
				return fmt.Errorf("execution: recording the %s leg: %w", leg.Symbol.String, err)
			}
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return fmt.Errorf("execution: committing quote for %s: %w", quote.Wallet, err)
	}
	return nil
}

func (leg Leg) params(index int, quote Quote) (executiondb.InsertLegParams, error) {
	field := fmt.Sprintf("legs[%d]", index)
	if err := address(field+".mint", leg.Mint); err != nil {
		return executiondb.InsertLegParams{}, err
	}
	if leg.Symbol == "" {
		return executiondb.InsertLegParams{}, Invalid{field + ".symbol is empty"}
	}
	if err := capped(field+".symbol", leg.Symbol, 40); err != nil {
		return executiondb.InsertLegParams{}, err
	}
	in, inScale, err := leg.In.check(field + ".in")
	if err != nil {
		return executiondb.InsertLegParams{}, err
	}
	out, outScale, err := leg.Out.check(field + ".out")
	if err != nil {
		return executiondb.InsertLegParams{}, err
	}
	floor, floorScale, err := leg.Floor.check(field + ".floor")
	if err != nil {
		return executiondb.InsertLegParams{}, err
	}
	if floorScale != outScale {
		return executiondb.InsertLegParams{}, Invalid{fmt.Sprintf("%s.floor has scale %d and out has %d; both are the output's", field, floorScale, outScale)}
	}
	for name, bps := range map[string]int{"routing_fee_bps": leg.RoutingFeeBps, "tip_offset_bps": leg.TipOffsetBps} {
		if bps < 0 || bps > 10_000 {
			return executiondb.InsertLegParams{}, Invalid{fmt.Sprintf("%s.%s %d is outside 0 to 10000", field, name, bps)}
		}
	}
	fee, err := numeric(field+".simulated_fee_atoms", leg.SimulatedFeeAtoms, signedAtoms)
	if err != nil {
		return executiondb.InsertLegParams{}, err
	}
	tip, err := numeric(field+".tip_lamports", leg.TipLamports, unsignedAtoms)
	if err != nil {
		return executiondb.InsertLegParams{}, err
	}
	if leg.Landing != "sender" && leg.Landing != "rpc" {
		return executiondb.InsertLegParams{}, Invalid{fmt.Sprintf("%s.landing %q is not sender or rpc", field, leg.Landing)}
	}
	if leg.LastValidBlockHeight < 1 {
		return executiondb.InsertLegParams{}, Invalid{fmt.Sprintf("%s.last_valid_block_height %d is not a block height", field, leg.LastValidBlockHeight)}
	}
	if !digestPattern.MatchString(leg.MessageSHA256) {
		return executiondb.InsertLegParams{}, Invalid{fmt.Sprintf("%s.message_sha256 %q is not 64 lowercase hex characters", field, leg.MessageSHA256)}
	}
	return executiondb.InsertLegParams{
		ID: pgtype.UUID{Bytes: leg.ID, Valid: true}, QuoteID: pgtype.UUID{Bytes: quote.ID, Valid: true}, Wallet: quote.Wallet,
		Mint: leg.Mint, Symbol: pgtype.Text{String: leg.Symbol, Valid: true}, InAtoms: in, InScale: pgtype.Int2{Int16: inScale, Valid: true},
		OutAtoms: out, FloorAtoms: floor, OutScale: pgtype.Int2{Int16: outScale, Valid: true},
		RoutingFeeBps: pgtype.Int4{Int32: int32(leg.RoutingFeeBps), Valid: true}, TipOffsetBps: pgtype.Int4{Int32: int32(leg.TipOffsetBps), Valid: true},
		SimulatedFeeAtoms: fee, TipLamports: tip, Landing: pgtype.Text{String: leg.Landing, Valid: true},
		LastValidBlockHeight: pgtype.Int8{Int64: leg.LastValidBlockHeight, Valid: true}, MessageSha256: leg.MessageSHA256, Source: "server",
	}, nil
}

// RecordSubmission writes what happened when a leg was sent. The first
// submission of a leg is kept; a repeat changes nothing and is not an error.
func (r *Report) RecordSubmission(ctx context.Context, submission Submission) error {
	if !digestPattern.MatchString(submission.MessageSHA256) {
		return Invalid{fmt.Sprintf("message_sha256 %q is not 64 lowercase hex characters", submission.MessageSHA256)}
	}
	if submission.Signature != "" && !signaturePattern.MatchString(submission.Signature) {
		return Invalid{fmt.Sprintf("signature %q is not a base58 transaction signature", submission.Signature)}
	}
	switch submission.Result {
	case "sent", "refused_not_sent", "uncertain":
	default:
		return Invalid{fmt.Sprintf("result %q is not sent, refused_not_sent or uncertain", submission.Result)}
	}
	if submission.SubmittedAt.IsZero() {
		return Invalid{"submitted_at is missing"}
	}
	if err := capped("text", submission.Text, 2000); err != nil {
		return err
	}
	updated, err := r.q.RecordSubmission(ctx, executiondb.RecordSubmissionParams{
		Signature: optionalText(submission.Signature), SubmittedAt: pgtype.Timestamptz{Time: submission.SubmittedAt.UTC(), Valid: true},
		SubmitResult: pgtype.Text{String: submission.Result, Valid: true}, SubmitText: optionalText(submission.Text), MessageSha256: submission.MessageSHA256,
	})
	if err != nil {
		return fmt.Errorf("execution: recording the submission of %s: %w", submission.MessageSHA256, err)
	}
	if updated == 0 {
		var exists bool
		if err := r.db.QueryRow(ctx, "SELECT EXISTS (SELECT 1 FROM execution.legs WHERE message_sha256 = $1)", submission.MessageSHA256).Scan(&exists); err != nil {
			return fmt.Errorf("execution: looking up leg %s: %w", submission.MessageSHA256, err)
		}
		if !exists {
			return ErrUnknownLeg
		}
	}
	return nil
}

// RecordFunnel writes the steps a browser reported, at the time they were
// received: a browser's clock is not evidence of when anything happened.
func (r *Report) RecordFunnel(ctx context.Context, deployment string, events []FunnelEvent, received time.Time) (err error) {
	if !deployments[deployment] {
		return Invalid{fmt.Sprintf("deployment %q is not production, preview or development", deployment)}
	}
	if len(events) == 0 || len(events) > 20 {
		return Invalid{fmt.Sprintf("%d events; a batch holds 1 to 20", len(events))}
	}
	rows := make([]executiondb.InsertFunnelEventParams, 0, len(events))
	for index, event := range events {
		row := executiondb.InsertFunnelEventParams{Kind: event.Kind, Deployment: deployment, ReceivedAt: pgtype.Timestamptz{Time: received.UTC(), Valid: true}}
		if !FunnelKinds[event.Kind] {
			if err := capped(fmt.Sprintf("events[%d].kind", index), event.Kind, 80); err != nil {
				return err
			}
			row.Kind, row.RawKind = "unrecognised", pgtype.Text{String: event.Kind, Valid: true}
		}
		if event.Wallet != "" {
			if err := address(fmt.Sprintf("events[%d].wallet", index), event.Wallet); err != nil {
				return err
			}
			row.Wallet = pgtype.Text{String: event.Wallet, Valid: true}
		}
		if event.QuoteID != nil {
			row.QuoteID = pgtype.UUID{Bytes: *event.QuoteID, Valid: true}
		}
		rows = append(rows, row)
	}
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("execution: opening the funnel transaction: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback(ctx)
		}
	}()
	q := r.q.WithTx(tx)
	for _, row := range rows {
		if err = q.InsertFunnelEvent(ctx, row); err != nil {
			return fmt.Errorf("execution: recording a %s step: %w", row.Kind, err)
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return fmt.Errorf("execution: committing funnel steps: %w", err)
	}
	return nil
}
