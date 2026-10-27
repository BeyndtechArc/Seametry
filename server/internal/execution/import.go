package execution

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math/big"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/BeyndtechArc/Seametry/server/internal/liquidity"
	"github.com/BeyndtechArc/Seametry/server/internal/solana"
	"github.com/BeyndtechArc/Seametry/server/internal/store/executiondb"
)

// History is what the import reads from Solana; *solana.Client is one.
type History interface {
	GetTokenAccountsByOwnerAndMint(ctx context.Context, owner, mint string) ([]string, error)
	GetSignaturesForAddress(ctx context.Context, address, before string, limit int) ([]solana.SignatureInfo, error)
	GetTransaction(ctx context.Context, signature string) (*solana.Transaction, error)
	GetTransactionMessage(ctx context.Context, signature string) ([]byte, error)
}

// Imported is what one import found, each count by its reason.
type Imported struct {
	FeeAccount      string
	Imported        int
	FeeAtoms        *big.Int
	AlreadyRecorded int
	Skipped         map[string]int
}

// trade reads one transaction as a leg of the wallet that paid for it: USDC
// moved one way and exactly one other token the other. Anything else is not
// a trade, and its reason is returned instead.
func trade(tx *solana.Transaction) (kind, mint string, usdc, token *big.Int, scale int, reason string) {
	usdc, _, _ = delta(tx, tx.FeePayer, liquidity.USDCMint)
	mints := map[string]bool{}
	for _, b := range append(append([]solana.TokenBalance{}, tx.PreTokens...), tx.PostTokens...) {
		if b.Owner == tx.FeePayer && b.Mint != liquidity.USDCMint && b.Mint != wrappedSOL {
			mints[b.Mint] = true
		}
	}
	var moved []string
	for candidate := range mints {
		if change, _, _ := delta(tx, tx.FeePayer, candidate); change.Sign() != 0 {
			moved = append(moved, candidate)
		}
	}
	if len(moved) != 1 {
		return "", "", nil, nil, 0, fmt.Sprintf("not a trade: %d tokens moved for the payer", len(moved))
	}
	mint = moved[0]
	token, scale, _ = delta(tx, tx.FeePayer, mint)
	switch {
	case usdc.Sign() < 0 && token.Sign() > 0:
		kind = "buy"
	case usdc.Sign() > 0 && token.Sign() < 0:
		kind = "sell"
	default:
		return "", "", nil, nil, 0, "not a trade: USDC and the token did not move in opposite directions"
	}
	return kind, mint, usdc, token, scale, ""
}

// ImportFromFeeAccount records every trade that paid Seametry's routing fee
// since the given time, read from the fee account's public history, as
// legs whose source is the chain. A signature already recorded is left as
// it is, so the import can run again and adds only what is new. A failed
// transaction is counted, not imported: its balances did not move, so they
// cannot say whether it was a purchase or a sale.
func (r *Report) ImportFromFeeAccount(ctx context.Context, history History, feeWallet string, since time.Time, symbols map[string]string, now time.Time) (Imported, error) {
	result := Imported{FeeAtoms: new(big.Int), Skipped: map[string]int{}}
	accounts, err := history.GetTokenAccountsByOwnerAndMint(ctx, feeWallet, liquidity.USDCMint)
	if err != nil {
		return result, fmt.Errorf("execution: finding %s's USDC account: %w", feeWallet, err)
	}
	if len(accounts) != 1 {
		return result, fmt.Errorf("execution: %s holds %d USDC accounts; the import reads exactly one", feeWallet, len(accounts))
	}
	result.FeeAccount = accounts[0]
	before := ""
	for {
		page, err := history.GetSignaturesForAddress(ctx, result.FeeAccount, before, 1000)
		if err != nil {
			return result, fmt.Errorf("execution: reading %s's history: %w", result.FeeAccount, err)
		}
		for _, entry := range page {
			if entry.BlockTime == nil || time.Unix(*entry.BlockTime, 0).Before(since) {
				return result, nil
			}
			if err := r.importOne(ctx, history, entry, feeWallet, symbols, now, &result); err != nil {
				return result, err
			}
		}
		if len(page) < 1000 {
			return result, nil
		}
		before = page[len(page)-1].Signature
	}
}

func (r *Report) importOne(ctx context.Context, history History, entry solana.SignatureInfo, feeWallet string, symbols map[string]string, now time.Time, result *Imported) error {
	recorded, err := r.q.LegWithSignature(ctx, pgtype.Text{String: entry.Signature, Valid: true})
	if err != nil {
		return fmt.Errorf("execution: looking up %s: %w", entry.Signature, err)
	}
	if recorded {
		result.AlreadyRecorded++
		return nil
	}
	if failed(entry.Err) {
		result.Skipped["failed on chain: its balances cannot say purchase or sale"]++
		return nil
	}
	tx, err := history.GetTransaction(ctx, entry.Signature)
	if err != nil || tx == nil {
		return fmt.Errorf("execution: reading %s: %v", entry.Signature, err)
	}
	kind, mint, usdc, token, scale, reason := trade(tx)
	if reason != "" {
		result.Skipped[reason]++
		return nil
	}
	message, err := history.GetTransactionMessage(ctx, entry.Signature)
	if err != nil {
		return fmt.Errorf("execution: reading %s's message: %w", entry.Signature, err)
	}
	digest := sha256.Sum256(message)
	fee, _, feeSeen := delta(tx, feeWallet, liquidity.USDCMint)
	if tx.BlockTime == nil {
		return fmt.Errorf("execution: %s has no block time", entry.Signature)
	}
	blockTime := pgtype.Timestamptz{Time: time.Unix(*tx.BlockTime, 0).UTC(), Valid: true}
	quoteID := idFrom("quote:" + entry.Signature)

	transaction, err := r.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("execution: opening the import of %s: %w", entry.Signature, err)
	}
	defer func() { _ = transaction.Rollback(ctx) }()
	q := r.q.WithTx(transaction)
	// A chain trade says nothing of where the wallet came from; its first quote
	// decides that.
	if err := q.TouchWallet(ctx, executiondb.TouchWalletParams{Address: tx.FeePayer, SeenAt: blockTime, DecidesSource: false}); err != nil {
		return fmt.Errorf("execution: recording wallet %s: %w", tx.FeePayer, err)
	}
	if err := q.InsertImportedQuote(ctx, executiondb.InsertImportedQuoteParams{ID: pgtype.UUID{Bytes: quoteID, Valid: true}, Wallet: tx.FeePayer, Kind: kind, PreparedAt: blockTime}); err != nil {
		return fmt.Errorf("execution: recording the quote of %s: %w", entry.Signature, err)
	}
	symbol, known := symbols[mint]
	err = q.InsertImportedLeg(ctx, executiondb.InsertImportedLegParams{
		ID: pgtype.UUID{Bytes: idFrom("leg:" + entry.Signature), Valid: true}, QuoteID: pgtype.UUID{Bytes: quoteID, Valid: true},
		Wallet: tx.FeePayer, Mint: mint, Symbol: pgtype.Text{String: symbol, Valid: known}, MessageSha256: hex.EncodeToString(digest[:]),
		Signature: pgtype.Text{String: entry.Signature, Valid: true}, BlockTime: blockTime, ChainOutcome: pgtype.Text{String: "landed", Valid: true},
		Slot: pgtype.Int8{Int64: int64(tx.Slot), Valid: true}, NetworkFeeLamports: numericOf(new(big.Int).SetUint64(tx.Fee), true),
		WalletUsdcDelta: numericOf(usdc, true), WalletTokenDelta: numericOf(token, true), TokenScale: pgtype.Int2{Int16: int16(scale), Valid: true},
		FeeCreditedAtoms: numericOf(fee, feeSeen), ReconciledAt: pgtype.Timestamptz{Time: now.UTC(), Valid: true},
	})
	if err != nil {
		return fmt.Errorf("execution: recording the leg of %s: %w", entry.Signature, err)
	}
	if err := transaction.Commit(ctx); err != nil {
		return fmt.Errorf("execution: committing the import of %s: %w", entry.Signature, err)
	}
	result.Imported++
	if feeSeen {
		result.FeeAtoms.Add(result.FeeAtoms, fee)
	}
	return nil
}
