package execution

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/BeyndtechArc/Seametry/server/internal/liquidity"
	"github.com/BeyndtechArc/Seametry/server/internal/solana"
	"github.com/BeyndtechArc/Seametry/server/internal/store/executiondb"
)

const feeWallet = "6WLwWPKwSHuX5WRnyzVVs1YxU958Jp6ZiGU584vFwuSx"

// fakeChain answers as a cluster would, signature by signature.
type fakeChain struct {
	statuses map[string]*solana.SignatureStatus
	txs      map[string]*solana.Transaction
	height   uint64
	asked    [][]string
}

func (f *fakeChain) GetSignatureStatuses(_ context.Context, signatures []string) ([]*solana.SignatureStatus, error) {
	f.asked = append(f.asked, signatures)
	out := make([]*solana.SignatureStatus, len(signatures))
	for i, s := range signatures {
		out[i] = f.statuses[s]
	}
	return out, nil
}

func (f *fakeChain) GetTransaction(_ context.Context, signature string) (*solana.Transaction, error) {
	return f.txs[signature], nil
}

func (f *fakeChain) GetBlockHeight(context.Context, string) (uint64, error) { return f.height, nil }

func balance(owner, mint, atoms string, decimals int) solana.TokenBalance {
	return solana.TokenBalance{Owner: owner, Mint: mint, Atoms: atoms, Decimals: decimals}
}

// sentLeg records a quote with one leg and its submission, returning the leg's signature.
func sentLeg(t *testing.T, report *Report, signature string, lastValid int64, result string) {
	t.Helper()
	quote := preparedQuote(t, nil)
	quote.Legs[0].LastValidBlockHeight = lastValid
	if err := report.RecordQuote(context.Background(), quote); err != nil {
		t.Fatal(err)
	}
	if err := report.RecordSubmission(context.Background(), Submission{MessageSHA256: quote.Legs[0].MessageSHA256, Signature: signature, SubmittedAt: time.Now(), Result: result}); err != nil {
		t.Fatal(err)
	}
}

func signature(n byte) string {
	base := "54RpCChVq8WcN3xsfKSqxZ7ChzwR8hPzHu5x1L9jnpBcQ9JgVz3yrCe2sPj7bLv3QUs6oWw3MqfAZ6ETtx6Mgs"
	return base + string([]byte{'A' + n, 'a' + n})
}

func TestEachSentLegIsSettledByWhatTheChainSays(t *testing.T) {
	report, pool := freshReport(t)
	ctx := context.Background()
	landed, failedLeg, dropped, inFlight, processed, refused := signature(0), signature(1), signature(2), signature(3), signature(4), signature(5)
	sentLeg(t, report, landed, 1000, "sent")
	sentLeg(t, report, failedLeg, 1000, "sent")
	sentLeg(t, report, dropped, 1000, "uncertain")
	sentLeg(t, report, inFlight, 1990, "sent")
	sentLeg(t, report, processed, 1000, "sent")
	sentLeg(t, report, refused, 1000, "refused_not_sent")
	blockTime := int64(1792000000)
	chain := &fakeChain{
		height: 2010,
		statuses: map[string]*solana.SignatureStatus{
			landed:    {Slot: 9, ConfirmationStatus: "confirmed", Err: json.RawMessage("null")},
			failedLeg: {Slot: 9, ConfirmationStatus: "finalized", Err: json.RawMessage(`{"InstructionError":[4,{"Custom":21}]}`)},
			processed: {Slot: 9, ConfirmationStatus: "processed"},
		},
		txs: map[string]*solana.Transaction{
			landed: {Signature: landed, Slot: 9, BlockTime: &blockTime, FeePayer: holder, Fee: 10819, Err: json.RawMessage("null"),
				PreTokens:  []solana.TokenBalance{balance(holder, liquidity.USDCMint, "5000000", 6), balance(holder, nvdax, "0", 8), balance(feeWallet, liquidity.USDCMint, "100", 6)},
				PostTokens: []solana.TokenBalance{balance(holder, liquidity.USDCMint, "4000000", 6), balance(holder, nvdax, "450783", 8), balance(feeWallet, liquidity.USDCMint, "2100", 6)}},
			failedLeg: {Signature: failedLeg, Slot: 9, BlockTime: &blockTime, FeePayer: holder, Fee: 18426, Err: json.RawMessage(`{"InstructionError":[4,{"Custom":21}]}`)},
		},
	}
	settled, err := report.Reconcile(ctx, chain, feeWallet, time.Now())
	if err != nil {
		t.Fatalf("reconciling: %v", err)
	}
	outcomes := map[string]Settlement{}
	for _, s := range settled {
		outcomes[s.Signature] = s
	}
	if len(settled) != 3 || outcomes[landed].Outcome != "landed" || outcomes[failedLeg].Outcome != "failed" || outcomes[dropped].Outcome != "dropped" {
		t.Fatalf("settled %+v, want landed, failed and dropped only", settled)
	}
	if !outcomes[landed].FirstLandedForWallet {
		t.Fatal("the wallet's first landed leg was not marked as its first")
	}
	if outcomes[failedLeg].ChainError != `{"InstructionError":[4,{"Custom":21}]}` {
		t.Fatalf("chain error: %q", outcomes[failedLeg].ChainError)
	}
	for _, asked := range chain.asked[0] {
		if asked == refused {
			t.Fatal("a leg refused before broadcast was asked about")
		}
	}
	var usdc, token, fee, networkFee string
	if err := pool.QueryRow(ctx, "SELECT wallet_usdc_delta::text, wallet_token_delta::text, fee_credited_atoms::text, network_fee_lamports::text FROM execution.legs WHERE signature = $1", landed).Scan(&usdc, &token, &fee, &networkFee); err != nil {
		t.Fatal(err)
	}
	if usdc != "-1000000" || token != "450783" || fee != "2000" || networkFee != "10819" {
		t.Fatalf("landed leg moved %s USDC, %s token, %s fee, %s lamports", usdc, token, fee, networkFee)
	}
	if n := count(t, pool, "SELECT count(*) FROM execution.legs WHERE chain_outcome IS NULL AND signature IN ($1, $2)", inFlight, processed); n != 2 {
		t.Fatalf("legs still in flight that were settled anyway: %d left unsettled of 2", n)
	}

	// The chain's first answer stands: a second pass that hears otherwise changes nothing.
	chain.statuses[dropped] = &solana.SignatureStatus{Slot: 10, ConfirmationStatus: "confirmed", Err: json.RawMessage("null")}
	again, err := report.Reconcile(ctx, chain, feeWallet, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	for _, s := range again {
		if s.Signature == landed || s.Signature == failedLeg || s.Signature == dropped {
			t.Fatalf("a settled leg was settled again: %+v", s)
		}
	}
}

// Two passes can race, for instance while a deploy overlaps two Gateways;
// the second to write must not replace the first answer.
func TestASettledLegIsNotSettledAgainByARacingPass(t *testing.T) {
	report, pool := freshReport(t)
	ctx := context.Background()
	sentLeg(t, report, signature(0), 1000, "sent")
	legs, err := report.q.UnsettledLegs(ctx)
	if err != nil || len(legs) != 1 {
		t.Fatalf("unsettled legs: %d (%v)", len(legs), err)
	}
	settle := func(outcome string) int64 {
		updated, err := report.q.SettleLeg(ctx, executiondb.SettleLegParams{
			ID: legs[0].ID, ChainOutcome: pgtype.Text{String: outcome, Valid: true}, ReconciledAt: pgtype.Timestamptz{Time: time.Now(), Valid: true},
		})
		if err != nil {
			t.Fatal(err)
		}
		return updated
	}
	if settle("landed") != 1 || settle("dropped") != 0 {
		t.Fatal("a second settlement replaced the first")
	}
	var outcome string
	if err := pool.QueryRow(ctx, "SELECT chain_outcome FROM execution.legs").Scan(&outcome); err != nil || outcome != "landed" {
		t.Fatalf("outcome %q (%v), want the first answer, landed", outcome, err)
	}
}

func TestFunnelStepsPastTheirRetentionAreDeleted(t *testing.T) {
	report, pool := freshReport(t)
	ctx := context.Background()
	old, recent := time.Now().AddDate(-2, -1, 0), time.Now().AddDate(0, -1, 0)
	if err := report.RecordFunnel(ctx, "production", []FunnelEvent{{Kind: "review_opened"}}, old); err != nil {
		t.Fatal(err)
	}
	if err := report.RecordFunnel(ctx, "production", []FunnelEvent{{Kind: "review_opened"}}, recent); err != nil {
		t.Fatal(err)
	}
	deleted, err := report.ForgetFunnelBefore(ctx, time.Now().AddDate(-2, 0, 0))
	if err != nil || deleted != 1 {
		t.Fatalf("deleted %d (%v), want the one older than 24 months", deleted, err)
	}
	if n := count(t, pool, "SELECT count(*) FROM execution.funnel_events"); n != 1 {
		t.Fatalf("%d steps left, want the recent one", n)
	}
}

// fakeHistory is a fee account's public history.
type fakeHistory struct {
	fakeChain
	entries []solana.SignatureInfo
}

func (f *fakeHistory) GetTokenAccountsByOwnerAndMint(context.Context, string, string) ([]string, error) {
	return []string{"J3obWpydMEgZpX2BoZvNBpZ4VKXceYVV8yuRDcEuXw8h"}, nil
}

func (f *fakeHistory) GetSignaturesForAddress(context.Context, string, string, int) ([]solana.SignatureInfo, error) {
	return f.entries, nil
}

func (f *fakeHistory) GetTransactionMessage(_ context.Context, signature string) ([]byte, error) {
	if _, ok := f.txs[signature]; !ok {
		return nil, errors.New("no such transaction")
	}
	return []byte("message of " + signature), nil
}

func TestTheFeeAccountsHistoryImportsTradesOnceAndSkipsWhatIsNotOne(t *testing.T) {
	report, pool := freshReport(t)
	ctx := context.Background()
	at := func(day int) *int64 { v := time.Date(2026, 10, day, 12, 0, 0, 0, time.UTC).Unix(); return &v }
	buy, sell, deposit, failedTx, early := signature(0), signature(1), signature(2), signature(3), signature(4)
	history := &fakeHistory{
		fakeChain: fakeChain{txs: map[string]*solana.Transaction{
			buy: {Signature: buy, Slot: 1, BlockTime: at(14), FeePayer: holder, Fee: 7556,
				PreTokens:  []solana.TokenBalance{balance(holder, liquidity.USDCMint, "3000000", 6), balance(feeWallet, liquidity.USDCMint, "0", 6)},
				PostTokens: []solana.TokenBalance{balance(holder, liquidity.USDCMint, "2000000", 6), balance(holder, nvdax, "450000", 8), balance(feeWallet, liquidity.USDCMint, "1000", 6)}},
			sell: {Signature: sell, Slot: 2, BlockTime: at(15), FeePayer: holder, Fee: 7000,
				PreTokens:  []solana.TokenBalance{balance(holder, liquidity.USDCMint, "0", 6), balance(holder, nvdax, "450000", 8), balance(holder, wrappedSOL, "0", 9)},
				PostTokens: []solana.TokenBalance{balance(holder, liquidity.USDCMint, "996449", 6), balance(holder, nvdax, "0", 8), balance(holder, wrappedSOL, "5", 9)}},
			deposit: {Signature: deposit, Slot: 3, BlockTime: at(13), FeePayer: holder, Fee: 5000,
				PreTokens:  []solana.TokenBalance{balance(feeWallet, liquidity.USDCMint, "0", 6)},
				PostTokens: []solana.TokenBalance{balance(feeWallet, liquidity.USDCMint, "100000000", 6)}},
		}},
		entries: []solana.SignatureInfo{
			{Signature: sell, BlockTime: at(15), Err: json.RawMessage("null")},
			{Signature: buy, BlockTime: at(14), Err: json.RawMessage("null")},
			{Signature: failedTx, BlockTime: at(14), Err: json.RawMessage(`{"InstructionError":[4,{"Custom":21}]}`)},
			{Signature: deposit, BlockTime: at(13), Err: json.RawMessage("null")},
			{Signature: early, BlockTime: at(1), Err: json.RawMessage("null")},
		},
	}
	since := time.Date(2026, 10, 11, 0, 0, 0, 0, time.UTC)
	symbols := map[string]string{nvdax: "NVDAx"}
	result, err := report.ImportFromFeeAccount(ctx, history, feeWallet, since, symbols, time.Now())
	if err != nil {
		t.Fatalf("importing: %v", err)
	}
	if result.Imported != 2 || result.FeeAtoms.String() != "1000" || len(result.Skipped) != 2 {
		t.Fatalf("imported %d with %s fee atoms, skipped %v; want 2, 1000 and a failure and a non-trade", result.Imported, result.FeeAtoms, result.Skipped)
	}
	var kind, symbol, source, outcome string
	if err := pool.QueryRow(ctx, "SELECT q.kind, l.symbol, l.source, l.chain_outcome FROM execution.legs l JOIN execution.quotes q ON q.id = l.quote_id WHERE l.signature = $1", sell).Scan(&kind, &symbol, &source, &outcome); err != nil {
		t.Fatal(err)
	}
	if kind != "sell" || symbol != "NVDAx" || source != "chain" || outcome != "landed" {
		t.Fatalf("the sale imported as %s %s from %s, %s", kind, symbol, source, outcome)
	}
	again, err := report.ImportFromFeeAccount(ctx, history, feeWallet, since, symbols, time.Now())
	if err != nil || again.Imported != 0 || again.AlreadyRecorded != 2 {
		t.Fatalf("second import: %+v (%v), want nothing new and both already recorded", again, err)
	}
}
