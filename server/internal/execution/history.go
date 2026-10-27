package execution

import (
	"context"
	"fmt"
	"math/big"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
)

// HistoryWalletLimit bounds the wallets one history read names; an account
// links few, and the bound keeps one read from scanning the whole record.
const HistoryWalletLimit = 20

// ChainAnswer is the chain's answer for a leg, written only by the
// reconciler or the backfill. A leg without one says what Seametry sent,
// never what settled.
type ChainAnswer struct {
	Outcome          string
	BlockTime        *time.Time
	ReconciledAt     time.Time
	WalletUSDCDelta  string
	WalletTokenDelta string
	TokenScale       *int
}

type HistoryLeg struct {
	ID           [16]byte
	Mint         string
	Symbol       string
	Source       string
	Signature    string
	SubmittedAt  time.Time
	SubmitResult string
	In           *Amount
	Out, Floor   *Amount
	Chain        *ChainAnswer
}

type HistoryQuote struct {
	ID         [16]byte
	Wallet     string
	Kind       string
	Subject    string
	TemplateID string
	PlanSize   int
	PreparedAt time.Time
	Source     string
	Legs       []HistoryLeg
}

// atoms writes a whole NUMERIC as decimal digits. pgx decodes 1000000 as
// 1 with exponent 6, so Int alone is not the value.
func atoms(value pgtype.Numeric) string {
	if !value.Valid || value.Int == nil {
		return ""
	}
	if value.Exp >= 0 {
		return new(big.Int).Mul(value.Int, new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(value.Exp)), nil)).String()
	}
	return new(big.Int).Quo(value.Int, new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(-value.Exp)), nil)).String()
}

func amountOf(value pgtype.Numeric, scale pgtype.Int2) *Amount {
	if !value.Valid || !scale.Valid {
		return nil
	}
	return &Amount{Atoms: atoms(value), Scale: int(scale.Int16)}
}

// History reads what the record holds for wallets: each quote with at least
// one sent leg, newest first, and only its sent legs. The caller decides
// whose wallets these are; History checks only that they are addresses.
func (r *Report) History(ctx context.Context, wallets []string) ([]HistoryQuote, error) {
	if len(wallets) > HistoryWalletLimit {
		return nil, Invalid{fmt.Sprintf("%d wallets; a history read names at most %d", len(wallets), HistoryWalletLimit)}
	}
	for index, wallet := range wallets {
		if err := address(fmt.Sprintf("wallets[%d]", index), wallet); err != nil {
			return nil, err
		}
	}
	if len(wallets) == 0 {
		return []HistoryQuote{}, nil
	}
	rows, err := r.q.WalletHistory(ctx, wallets)
	if err != nil {
		return nil, fmt.Errorf("execution: reading the history of %d wallets: %w", len(wallets), err)
	}
	quotes := []HistoryQuote{}
	for _, row := range rows {
		if len(quotes) == 0 || quotes[len(quotes)-1].ID != row.QuoteID.Bytes {
			quotes = append(quotes, HistoryQuote{
				ID: row.QuoteID.Bytes, Wallet: row.Wallet, Kind: row.Kind, Subject: row.Subject.String,
				TemplateID: row.TemplateID.String, PlanSize: int(row.PlanSize), PreparedAt: row.PreparedAt.Time, Source: row.QuoteSource,
			})
		}
		leg := HistoryLeg{
			ID: row.LegID.Bytes, Mint: row.Mint, Symbol: row.Symbol.String, Source: row.LegSource, Signature: row.Signature.String,
			SubmittedAt: row.SubmittedAt.Time, SubmitResult: row.SubmitResult.String,
			In: amountOf(row.InAtoms, row.InScale), Out: amountOf(row.OutAtoms, row.OutScale), Floor: amountOf(row.FloorAtoms, row.OutScale),
		}
		if row.ChainOutcome.Valid {
			settlement := &ChainAnswer{
				Outcome: row.ChainOutcome.String, ReconciledAt: row.ReconciledAt.Time,
				WalletUSDCDelta: atoms(row.WalletUsdcDelta), WalletTokenDelta: atoms(row.WalletTokenDelta),
			}
			if row.BlockTime.Valid {
				settlement.BlockTime = &row.BlockTime.Time
			}
			if row.TokenScale.Valid {
				scale := int(row.TokenScale.Int16)
				settlement.TokenScale = &scale
			}
			leg.Chain = settlement
		}
		last := &quotes[len(quotes)-1]
		last.Legs = append(last.Legs, leg)
	}
	return quotes, nil
}
