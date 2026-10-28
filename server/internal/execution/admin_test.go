package execution

import (
	"context"
	"crypto/rand"
	"errors"
	"reflect"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/BeyndtechArc/Seametry/server/internal/base58"
)

// adminSeed writes the record the Admin's definitions are checked against,
// row by row in SQL so each expected figure below can be reproduced by hand
// from this function alone (docs/prd/ADMIN.md).
type adminSeed struct {
	t    *testing.T
	pool *pgxpool.Pool
}

func day(d, hour int) time.Time { return time.Date(2026, 10, d, hour, 0, 0, 0, time.UTC) }

func randomAddress(t *testing.T) string {
	t.Helper()
	value := make([]byte, 32)
	if _, err := rand.Read(value); err != nil {
		t.Fatal(err)
	}
	return base58.Encode(value)
}

func randomSignature(t *testing.T) string {
	t.Helper()
	value := make([]byte, 64)
	if _, err := rand.Read(value); err != nil {
		t.Fatal(err)
	}
	return base58.Encode(value)
}

func (s adminSeed) exec(query string, args ...any) {
	s.t.Helper()
	if _, err := s.pool.Exec(context.Background(), query, args...); err != nil {
		s.t.Fatalf("%s: %v", query, err)
	}
}

func (s adminSeed) wallet(address string, seen time.Time, refCode string) {
	s.t.Helper()
	if refCode == "" {
		s.exec("INSERT INTO execution.wallets (address, first_seen_at) VALUES ($1, $2)", address, seen)
		return
	}
	s.exec("INSERT INTO execution.wallets (address, first_seen_at, first_source, first_source_at) VALUES ($1, $2, jsonb_build_object('ref_code', $3::text), $2)", address, seen, refCode)
}

func (s adminSeed) quote(wallet, kind, deployment string, prepared time.Time, refusal int) [16]byte {
	s.t.Helper()
	quote := id(s.t)
	if refusal == 0 {
		s.exec(`INSERT INTO execution.quotes (id, wallet, network, kind, plan_size, deployment, prepared_at, outcome, source)
			VALUES ($1, $2, 'mainnet', $3, 1, $4, $5, 'prepared', 'server')`, quote, wallet, kind, deployment, prepared)
		return quote
	}
	s.exec(`INSERT INTO execution.quotes (id, wallet, network, kind, plan_size, deployment, prepared_at, outcome, refusal_status, refusal_text, source)
		VALUES ($1, $2, 'mainnet', $3, 1, $4, $5, 'refused', $6, 'refused in the seed', 'server')`, quote, wallet, kind, deployment, prepared, refusal)
	return quote
}

// leg is a server leg sent at sent and answered by the chain at the same
// instant with outcome, the wallet's USDC delta and the fee credited.
func (s adminSeed) leg(quote [16]byte, wallet, landing string, tipBps int, sent time.Time, outcome string, usdcDelta, fee int64) {
	s.t.Helper()
	s.exec(`INSERT INTO execution.legs (
			id, quote_id, wallet, mint, symbol, in_atoms, in_scale, out_atoms, floor_atoms, out_scale, routing_fee_bps, tip_offset_bps,
			simulated_fee_atoms, tip_lamports, landing, last_valid_block_height, message_sha256, signature, submitted_at, submit_result, source,
			chain_outcome, block_time, wallet_usdc_delta, fee_credited_atoms, reconciled_at)
		VALUES ($1, $2, $3, $4, 'NVDAx', 1, 6, 1, 1, 8, 30, $5, 0, 0, $6, 435000000, $7, $8, $9, 'sent', 'server', $10, $9, $11, $12, $9)`,
		id(s.t), quote, wallet, nvdax, tipBps, landing, digest(s.t), randomSignature(s.t), sent, outcome, usdcDelta, fee)
}

func (s adminSeed) imported(wallet string, at time.Time, usdcDelta, fee int64) {
	s.t.Helper()
	quote := id(s.t)
	s.exec(`INSERT INTO execution.quotes (id, wallet, network, kind, plan_size, deployment, prepared_at, outcome, source)
		VALUES ($1, $2, 'mainnet', 'buy', 1, 'production', $3, 'prepared', 'chain')`, quote, wallet, at)
	s.exec(`INSERT INTO execution.legs (id, quote_id, wallet, mint, message_sha256, signature, submitted_at, submit_result, source,
			chain_outcome, block_time, wallet_usdc_delta, fee_credited_atoms, reconciled_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, 'sent', 'chain', 'landed', $7, $8, $9, $7)`,
		id(s.t), quote, wallet, nvdax, digest(s.t), randomSignature(s.t), at, usdcDelta, fee)
}

func (s adminSeed) funnel(kind string, wallet string, quote [16]byte, at time.Time) {
	s.t.Helper()
	s.exec(`INSERT INTO execution.funnel_events (kind, wallet, quote_id, deployment, received_at, source) VALUES ($1, $2, $3, 'production', $4, 'client')`, kind, wallet, quote, at)
}

// The period read below is 10 to 20 October. A arrives by the ref code
// storm, buys and fails a leg on the 11th and sells on the 15th. B arrives
// with no source, is refused on the 12th and has a trade found only on
// chain on the 19th. C arrived by storm on the 5th, before the period, and
// buys again on the 18th. P's trade is on preview and must not appear.
func seedAdminRecord(t *testing.T, pool *pgxpool.Pool) (a, b, c string) {
	s := adminSeed{t, pool}
	a, b, c, p := randomAddress(t), randomAddress(t), randomAddress(t), randomAddress(t)
	s.wallet(a, day(11, 9), "storm")
	s.wallet(b, day(12, 9), "")
	s.wallet(c, day(5, 9), "storm")
	s.wallet(p, day(12, 9), "storm")

	q1 := s.quote(a, "buy", "production", day(11, 9), 0)
	s.leg(q1, a, "sender", 100, day(11, 10), "landed", -1_000_000, 3000)
	s.leg(q1, a, "sender", 100, day(11, 10), "failed", 0, 0)
	q2 := s.quote(a, "sell", "production", day(15, 9), 0)
	s.leg(q2, a, "rpc", 0, day(15, 10), "landed", 500_000, 1500)
	s.funnel("review_opened", a, q1, day(11, 9))
	s.funnel("review_opened", a, q1, day(11, 9))
	s.funnel("signature_requested", a, q1, day(11, 9))

	s.quote(b, "buy", "production", day(12, 9), 422)
	s.imported(b, day(19, 9), -400_000, 1200)

	q4 := s.quote(c, "buy", "production", day(5, 9), 0)
	s.leg(q4, c, "sender", 50, day(5, 10), "landed", -2_000_000, 6000)
	q5 := s.quote(c, "buy", "production", day(18, 9), 0)
	s.leg(q5, c, "sender", 50, day(18, 10), "landed", -700_000, 2100)

	qp := s.quote(p, "buy", "preview", day(12, 9), 0)
	s.leg(qp, p, "sender", 100, day(12, 10), "landed", -9_000_000, 27000)
	return a, b, c
}

var adminPeriod = Period{From: day(10, 0), To: day(20, 0), Deployment: "production"}

func TestAdminOverviewReproducesEachDefinitionFromTheSeed(t *testing.T) {
	report, pool := freshReport(t)
	seedAdminRecord(t, pool)
	overview, err := report.Overview(context.Background(), adminPeriod)
	if err != nil {
		t.Fatal(err)
	}
	// Volume: A's 1,000,000 out and 500,000 in, C's 700,000 out on the
	// 18th and B's 400,000 from chain. A's failed leg, C's leg on the 5th
	// and P's preview leg are not counted.
	if overview.VolumeAtoms != "2600000" {
		t.Errorf("volume = %s atoms, want 2600000", overview.VolumeAtoms)
	}
	if overview.FeeAtoms != "7800" {
		t.Errorf("fee revenue = %s atoms, want 3000 + 1500 + 2100 + 1200 = 7800", overview.FeeAtoms)
	}
	// Tip cost: 100 bps of 1,000,000 and 50 bps of 700,000. A sale with 0
	// bps adds nothing, and B's chain-only leg recorded no tip offset.
	if overview.TipCostAtoms != "13500" {
		t.Errorf("tip cost = %s atoms, want 10000 + 3500 = 13500", overview.TipCostAtoms)
	}
	if overview.LandedLegs != 4 {
		t.Errorf("landed legs = %d, want 4", overview.LandedLegs)
	}
	if overview.SeenWallets != 2 || overview.SeenAndActivatedWallets != 2 {
		t.Errorf("seen = %d, of them activated by the end = %d; want A and B, both", overview.SeenWallets, overview.SeenAndActivatedWallets)
	}
	if overview.ActivatedWallets != 2 {
		t.Errorf("activated = %d, want A and B (C activated on the 5th)", overview.ActivatedWallets)
	}
	if overview.ActiveWallets != 3 {
		t.Errorf("active = %d, want A, B and C", overview.ActiveWallets)
	}
	if overview.ReturningWallets != 2 {
		t.Errorf("returning = %d, want A (11th, 15th) and C (5th, 18th)", overview.ReturningWallets)
	}
	if overview.LastReconciledAt == nil || !overview.LastReconciledAt.Equal(day(19, 9)) {
		t.Errorf("last reconciled = %v, want the 19th 09:00 UTC", overview.LastReconciledAt)
	}
	wantFunnel := Funnel{Requested: 4, Prepared: 3, Refused: 1, ReviewOpened: 1, SignatureRequested: 1, Sent: 3, Landed: 3}
	if overview.Funnel != wantFunnel {
		t.Errorf("funnel = %+v, want %+v", overview.Funnel, wantFunnel)
	}
	if want := []RefusalCount{{Status: 422, Quotes: 1}}; !reflect.DeepEqual(overview.Refusals, want) {
		t.Errorf("refusals = %+v, want %+v", overview.Refusals, want)
	}
	wantPaths := []Reliability{
		{Landing: "sender", Sent: 3, Landed: 2, Failed: 1},
		{Landing: "rpc", Sent: 1, Landed: 1},
		{Landing: "unrecorded", Sent: 1, Landed: 1},
	}
	if !reflect.DeepEqual(overview.Reliability, wantPaths) {
		t.Errorf("reliability = %+v, want %+v", overview.Reliability, wantPaths)
	}
}

func TestAdminSourcesGroupByFirstTouchRefCodeWithUnknownForNone(t *testing.T) {
	report, pool := freshReport(t)
	seedAdminRecord(t, pool)
	sources, err := report.Sources(context.Background(), adminPeriod)
	if err != nil {
		t.Fatal(err)
	}
	want := []SourceTotals{
		{Source: "storm", SeenWallets: 1, ActivatedWallets: 1, ActiveWallets: 2, VolumeAtoms: "2200000", FeeAtoms: "6600"},
		{Source: "unknown", SeenWallets: 1, ActivatedWallets: 1, ActiveWallets: 1, VolumeAtoms: "400000", FeeAtoms: "1200"},
	}
	if !reflect.DeepEqual(sources, want) {
		t.Fatalf("sources = %+v, want %+v", sources, want)
	}
}

func TestAdminWalletsListAllTimeTotalsNewestFirstInOneDeploymentByPage(t *testing.T) {
	report, pool := freshReport(t)
	a, b, c := seedAdminRecord(t, pool)
	want := []WalletTotals{
		{Address: b, FirstSeenAt: day(12, 9), Source: "unknown", Quotes: 2, LandedLegs: 1, VolumeAtoms: "400000", FeeAtoms: "1200"},
		{Address: a, FirstSeenAt: day(11, 9), Source: "storm", Quotes: 2, LandedLegs: 2, VolumeAtoms: "1500000", FeeAtoms: "4500"},
		{Address: c, FirstSeenAt: day(5, 9), Source: "storm", Quotes: 2, LandedLegs: 2, VolumeAtoms: "2700000", FeeAtoms: "8100"},
	}
	var got []WalletTotals
	var after *WalletCursor
	for pages := 1; ; pages++ {
		page, err := report.Wallets(context.Background(), "production", after, 2)
		if err != nil {
			t.Fatal(err)
		}
		if page.Total != 3 {
			t.Fatalf("page %d total = %d, want all 3 production wallets", pages, page.Total)
		}
		if len(page.Wallets) > 2 {
			t.Fatalf("page %d held %d wallets, want at most the limit of 2", pages, len(page.Wallets))
		}
		got = append(got, page.Wallets...)
		if page.Next == nil {
			if pages != 2 {
				t.Fatalf("the list ended after %d pages, want 2", pages)
			}
			break
		}
		if pages == 2 {
			t.Fatal("the second page of three wallets named a next cursor")
		}
		after = page.Next
	}
	for index := range got {
		got[index].FirstSeenAt = got[index].FirstSeenAt.UTC()
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("wallets = %+v, want %+v", got, want)
	}
	for _, limit := range []int{0, 201} {
		if _, err := report.Wallets(context.Background(), "production", nil, limit); !errors.As(err, new(Invalid)) {
			t.Fatalf("limit %d: err = %v, want Invalid", limit, err)
		}
	}
}

func TestAdminRecentActivityLabelsEachRowWithWhoseWordItIs(t *testing.T) {
	report, pool := freshReport(t)
	_, b, _ := seedAdminRecord(t, pool)
	rows, err := report.RecentActivity(context.Background(), adminPeriod)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) == 0 || rows[0].Source != "chain" || rows[0].Event != "landed" || rows[0].Wallet != b {
		t.Fatalf("newest row = %+v, want B's landed chain row on the 19th", rows[0])
	}
	sources := map[string]int{}
	for _, row := range rows {
		sources[row.Source]++
		if row.Detail == "NVDAx" && row.At.Equal(day(12, 10)) {
			t.Fatalf("a preview row reached production's activity: %+v", row)
		}
		if row.Source != "chain" && (row.Event == "landed" || row.Event == "failed" || row.Event == "dropped") {
			t.Fatalf("a %s row carries the chain outcome %s: %+v", row.Source, row.Event, row)
		}
	}
	if sources["server"] == 0 || sources["client"] != 3 || sources["chain"] == 0 {
		t.Fatalf("rows by source = %v, want server, chain and the 3 client steps", sources)
	}
}

func TestAdminPeriodRefusesAnUnknownDeploymentAndABackwardsOrOverlongRange(t *testing.T) {
	report, _ := freshReport(t)
	for _, period := range []Period{
		{From: day(10, 0), To: day(20, 0), Deployment: "staging"},
		{From: day(20, 0), To: day(10, 0), Deployment: "production"},
		{From: day(1, 0).AddDate(-2, 0, 0), To: day(1, 0), Deployment: "production"},
	} {
		if _, err := report.Overview(context.Background(), period); err == nil {
			t.Fatalf("period %+v was read, want it refused", period)
		} else if _, ok := err.(Invalid); !ok {
			t.Fatalf("period %+v: %v, want an Invalid", period, err)
		}
	}
}
