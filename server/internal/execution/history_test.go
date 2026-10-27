package execution

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

const stranger = "4vJ9JU1bJJE96FWSJKvHsmmFZjwQXW8UTQpLzMAnX1d"

func TestHistoryReadsOnlyTheNamedWalletsSentLegsAndSaysWhichSettled(t *testing.T) {
	report, pool := freshReport(t)
	ctx := context.Background()
	record := func(wallet string, preparedAt time.Time, signature string) Quote {
		t.Helper()
		quote := preparedQuote(t, nil)
		quote.Wallet, quote.PreparedAt = wallet, preparedAt
		if err := report.RecordQuote(ctx, quote); err != nil {
			t.Fatal(err)
		}
		if signature != "" {
			if err := report.RecordSubmission(ctx, Submission{MessageSHA256: quote.Legs[0].MessageSHA256, Signature: signature, SubmittedAt: preparedAt.Add(time.Second), Result: "sent"}); err != nil {
				t.Fatal(err)
			}
		}
		return quote
	}
	day := time.Date(2026, 10, 20, 9, 0, 0, 0, time.UTC)
	settled := record(holder, day, signature(1))
	unsettled := record(holder, day.Add(time.Hour), signature(2))
	record(holder, day.Add(2*time.Hour), "")
	record(stranger, day.Add(3*time.Hour), signature(3))
	if _, err := pool.Exec(ctx, `UPDATE execution.legs SET chain_outcome = 'landed', block_time = $2, reconciled_at = $2,
		wallet_usdc_delta = -1000000, wallet_token_delta = 450000, token_scale = 8 WHERE signature = $1`, signature(1), day.Add(time.Minute)); err != nil {
		t.Fatal(err)
	}

	history, err := report.History(ctx, []string{holder})
	if err != nil {
		t.Fatal(err)
	}
	if len(history) != 2 {
		t.Fatalf("history holds %d quotes, want 2: the unsent quote and the other wallet's are not this wallet's history", len(history))
	}
	if history[0].ID != unsettled.ID || history[1].ID != settled.ID {
		t.Fatalf("history is not newest first: got %x then %x", history[0].ID, history[1].ID)
	}
	if leg := history[0].Legs[0]; leg.Chain != nil || leg.Source != "server" || leg.Signature != signature(2) {
		t.Fatalf("an unsettled leg must carry no chain answer: %+v", leg)
	}
	leg := history[1].Legs[0]
	if leg.Chain == nil || leg.Chain.Outcome != "landed" || leg.Chain.WalletTokenDelta != "450000" || leg.Chain.WalletUSDCDelta != "-1000000" || *leg.Chain.TokenScale != 8 {
		t.Fatalf("the settled leg's chain answer: %+v", leg.Chain)
	}
	if leg.In == nil || *leg.In != (Amount{"1000000", 6}) {
		t.Fatalf("the quoted spend: %+v", leg.In)
	}
	for _, quote := range history {
		if quote.Wallet != holder {
			t.Fatalf("history for %s returned a quote of %s", holder, quote.Wallet)
		}
	}

	if none, err := report.History(ctx, nil); err != nil || len(none) != 0 {
		t.Fatalf("no wallets: got %d quotes, %v; want none and no error", len(none), err)
	}
}

func TestHistoryRefusesWhatIsNotAWalletList(t *testing.T) {
	report := NewReport(nil)
	var invalid Invalid
	if _, err := report.History(context.Background(), []string{"not-an-address"}); !errors.As(err, &invalid) || !strings.Contains(invalid.Reason, "wallets[0]") {
		t.Fatalf("a malformed address: got %v, want Invalid naming wallets[0]", err)
	}
	many := make([]string, HistoryWalletLimit+1)
	for index := range many {
		many[index] = holder
	}
	if _, err := report.History(context.Background(), many); !errors.As(err, &invalid) {
		t.Fatalf("%d wallets: got %v, want Invalid", len(many), err)
	}
}
