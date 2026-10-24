package execution

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/BeyndtechArc/Seametry/server/internal/liquidity"
	"github.com/BeyndtechArc/Seametry/server/internal/solana"
	"github.com/BeyndtechArc/Seametry/server/internal/store/executiondb"
)

// Chain is what settlement reads from Solana; *solana.Client is one.
type Chain interface {
	GetSignatureStatuses(ctx context.Context, signatures []string) ([]*solana.SignatureStatus, error)
	GetTransaction(ctx context.Context, signature string) (*solana.Transaction, error)
	GetBlockHeight(ctx context.Context, commitment string) (uint64, error)
}

// DropMarginBlocks is how far past its last valid block height a leg the
// cluster never saw must be before it is called dropped, the margin the
// browser watcher uses (clients/web/src/lib/execution/record.ts).
const DropMarginBlocks = 20

// wrappedSOL is never the token a leg trades: a route may open and close a
// wrapped SOL account on the way, which moves its balance without meaning.
const wrappedSOL = "So11111111111111111111111111111111111111112"

// Settlement is one leg the chain has just answered for.
type Settlement struct {
	Wallet               string
	Mint                 string
	Symbol               string
	Signature            string
	Outcome              string
	ChainError           string
	FirstLandedForWallet bool
}

// delta is what owner's balance of mint changed by in tx, in atoms, with the
// mint's decimals; seen is false when tx records no balance of it at all.
func delta(tx *solana.Transaction, owner, mint string) (change *big.Int, decimals int, seen bool) {
	change = new(big.Int)
	add := func(balances []solana.TokenBalance, sign int64) {
		for _, b := range balances {
			if b.Owner != owner || b.Mint != mint {
				continue
			}
			atoms, ok := new(big.Int).SetString(b.Atoms, 10)
			if !ok {
				continue
			}
			change.Add(change, atoms.Mul(atoms, big.NewInt(sign)))
			decimals, seen = b.Decimals, true
		}
	}
	add(tx.PostTokens, 1)
	add(tx.PreTokens, -1)
	return change, decimals, seen
}

func numericOf(value *big.Int, seen bool) pgtype.Numeric {
	return pgtype.Numeric{Int: value, Valid: seen}
}

func failed(raw json.RawMessage) bool {
	return len(raw) > 0 && string(raw) != "null"
}

// Reconcile asks the chain about every sent, unsettled leg and records its
// answer: landed or failed with what moved, or dropped once its deadline
// has passed unseen. A leg still in flight is left for the next pass. The
// legs it settled are returned for Alert; a failure reading one leg is
// returned with the rest still settled.
func (r *Report) Reconcile(ctx context.Context, chain Chain, feeWallet string, now time.Time) ([]Settlement, error) {
	legs, err := r.q.UnsettledLegs(ctx)
	if err != nil {
		return nil, fmt.Errorf("execution: reading unsettled legs: %w", err)
	}
	if len(legs) == 0 {
		return nil, nil
	}
	signatures := make([]string, len(legs))
	for i, leg := range legs {
		signatures[i] = leg.Signature.String
	}
	statuses, err := chain.GetSignatureStatuses(ctx, signatures)
	if err != nil {
		return nil, fmt.Errorf("execution: asking the chain about %d legs: %w", len(legs), err)
	}
	var settled []Settlement
	var problems []error
	var height uint64
	for i, leg := range legs {
		params := executiondb.SettleLegParams{ID: leg.ID, ReconciledAt: pgtype.Timestamptz{Time: now.UTC(), Valid: true}}
		status := statuses[i]
		switch {
		case status == nil:
			if !leg.LastValidBlockHeight.Valid {
				continue
			}
			if height == 0 {
				if height, err = chain.GetBlockHeight(ctx, "confirmed"); err != nil {
					return settled, fmt.Errorf("execution: reading the block height: %w", err)
				}
			}
			if height <= uint64(leg.LastValidBlockHeight.Int64)+DropMarginBlocks {
				continue
			}
			params.ChainOutcome = pgtype.Text{String: "dropped", Valid: true}
		case status.ConfirmationStatus != "confirmed" && status.ConfirmationStatus != "finalized":
			continue
		default:
			tx, err := chain.GetTransaction(ctx, leg.Signature.String)
			if err != nil {
				problems = append(problems, fmt.Errorf("execution: reading %s: %w", leg.Signature.String, err))
				continue
			}
			if tx == nil {
				continue
			}
			params.ChainOutcome = pgtype.Text{String: "landed", Valid: true}
			if failed(tx.Err) {
				params.ChainOutcome.String = "failed"
				params.ChainError = tx.Err
			}
			params.Slot = pgtype.Int8{Int64: int64(tx.Slot), Valid: true}
			if tx.BlockTime != nil {
				params.BlockTime = pgtype.Timestamptz{Time: time.Unix(*tx.BlockTime, 0).UTC(), Valid: true}
			}
			params.NetworkFeeLamports = numericOf(new(big.Int).SetUint64(tx.Fee), true)
			usdc, _, usdcSeen := delta(tx, leg.Wallet, liquidity.USDCMint)
			token, scale, tokenSeen := delta(tx, leg.Wallet, leg.Mint)
			params.WalletUsdcDelta = numericOf(usdc, usdcSeen)
			params.WalletTokenDelta = numericOf(token, tokenSeen)
			params.TokenScale = pgtype.Int2{Int16: int16(scale), Valid: tokenSeen}
			if feeWallet != "" {
				fee, _, feeSeen := delta(tx, feeWallet, liquidity.USDCMint)
				params.FeeCreditedAtoms = numericOf(fee, feeSeen)
			}
		}
		updated, err := r.q.SettleLeg(ctx, params)
		if err != nil {
			problems = append(problems, fmt.Errorf("execution: settling %s: %w", leg.Signature.String, err))
			continue
		}
		if updated == 0 {
			continue
		}
		settlement := Settlement{Wallet: leg.Wallet, Mint: leg.Mint, Symbol: leg.Symbol.String, Signature: leg.Signature.String, Outcome: params.ChainOutcome.String, ChainError: string(params.ChainError)}
		if settlement.Outcome == "landed" {
			if landed, err := r.q.LandedLegsForWallet(ctx, leg.Wallet); err == nil && landed == 1 {
				settlement.FirstLandedForWallet = true
			}
		}
		settled = append(settled, settlement)
	}
	return settled, errors.Join(problems...)
}

// ForgetFunnelBefore deletes funnel steps received before cutoff, the
// retention the privacy policy states.
func (r *Report) ForgetFunnelBefore(ctx context.Context, cutoff time.Time) (int64, error) {
	deleted, err := r.q.DeleteFunnelEventsBefore(ctx, pgtype.Timestamptz{Time: cutoff.UTC(), Valid: true})
	if err != nil {
		return 0, fmt.Errorf("execution: deleting funnel steps before %s: %w", cutoff.Format(time.DateOnly), err)
	}
	return deleted, nil
}

// idFrom is a stable version 5 style UUID for a name, so importing the same
// signature twice writes the same row.
func idFrom(name string) [16]byte {
	sum := sha256.Sum256([]byte(name))
	var id [16]byte
	copy(id[:], sum[:16])
	id[6] = id[6]&0x0f | 0x50
	id[8] = id[8]&0x3f | 0x80
	return id
}
