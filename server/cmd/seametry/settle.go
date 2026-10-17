package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"

	"github.com/BeyndtechArc/Seametry/server/internal/alert"
	"github.com/BeyndtechArc/Seametry/server/internal/execution"
	"github.com/BeyndtechArc/Seametry/server/internal/solana"
	"github.com/BeyndtechArc/Seametry/server/internal/store"
)

// settleEvery is how often sent legs are checked against the chain: one
// status call for up to 256 legs, inside Helius Free's ten a second.
const settleEvery = 30 * time.Second

// funnelRetention is the privacy policy's: funnel steps older are deleted.
const funnelRetention = 24 // months

func mainnetEndpoint() string {
	return solana.EndpointFromEnv("https://api.mainnet-beta.solana.com")
}

func settlementsForAlert(settled []execution.Settlement) []alert.Settlement {
	out := make([]alert.Settlement, 0, len(settled))
	for _, s := range settled {
		out = append(out, alert.Settlement{Wallet: s.Wallet, Symbol: s.Symbol, Mint: s.Mint, Signature: s.Signature, Outcome: s.Outcome, ChainError: s.ChainError, FirstLandedForWallet: s.FirstLandedForWallet})
	}
	return out
}

// settle runs beside the Gateway until ctx ends: it settles sent legs
// against the chain, tells the team about any worth a look, and once a day
// deletes funnel steps past their retention.
func settle(ctx context.Context, report *execution.Report, chain execution.Chain, feeWallet string, notices *alert.Notices) {
	ticker := time.NewTicker(settleEvery)
	defer ticker.Stop()
	var forgotten time.Time
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
		now := time.Now()
		settled, err := report.Reconcile(ctx, chain, feeWallet, now)
		if err != nil {
			slog.Warn("seametry: settling legs", "error", err.Error())
		}
		if len(settled) > 0 {
			slog.Info("seametry: settled legs", "count", len(settled))
			if err := notices.Settlements(ctx, settlementsForAlert(settled)); err != nil {
				slog.Warn("seametry: keeping a settlements notice", "error", err.Error())
			}
		}
		if now.Sub(forgotten) >= 24*time.Hour {
			deleted, err := report.ForgetFunnelBefore(ctx, now.AddDate(0, -funnelRetention, 0))
			if err != nil {
				slog.Warn("seametry: deleting expired funnel steps", "error", err.Error())
			} else {
				forgotten = now
				if deleted > 0 {
					slog.Info("seametry: deleted expired funnel steps", "count", deleted)
				}
			}
		}
	}
}

// admittedSymbols reads each mint's symbol from the admissions register, so
// imported legs carry the name the reader knows. A mint absent from it keeps
// no symbol rather than a guessed one.
func admittedSymbols(path string) (map[string]string, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading the admissions register at %s: %w", path, err)
	}
	var register struct {
		Instruments []struct {
			Instrument struct {
				Mint   string `json:"mint"`
				Symbol string `json:"symbol"`
			} `json:"instrument"`
		} `json:"instruments"`
	}
	if err := json.Unmarshal(raw, &register); err != nil {
		return nil, fmt.Errorf("parsing the admissions register at %s: %w", path, err)
	}
	symbols := make(map[string]string, len(register.Instruments))
	for _, entry := range register.Instruments {
		if entry.Instrument.Symbol != "" {
			symbols[entry.Instrument.Mint] = entry.Instrument.Symbol
		}
	}
	return symbols, nil
}

// importActivity records the trades that paid Seametry's routing fee since
// a date, from the fee account's public history. It may run again: what is
// already recorded is left alone.
func importActivity(args []string) error {
	flags := flag.NewFlagSet("import-activity", flag.ContinueOnError)
	sinceText := flags.String("since", "2026-10-11", "the first UTC day to import, YYYY-MM-DD")
	admissions := flags.String("admissions", "shared/evidence/admissions.json", "the admissions register, for symbols")
	if err := flags.Parse(args); err != nil {
		return err
	}
	since, err := time.Parse(time.DateOnly, *sinceText)
	if err != nil {
		return fmt.Errorf("-since %q is not a YYYY-MM-DD day: %w", *sinceText, err)
	}
	dsn := os.Getenv("SEAMETRY_DATABASE_URL")
	feeWallet := strings.TrimSpace(os.Getenv("SEAMETRY_FEE_WALLET"))
	if dsn == "" || feeWallet == "" {
		return errors.New("import-activity needs SEAMETRY_DATABASE_URL and SEAMETRY_FEE_WALLET, the wallet whose USDC account receives the routing fee")
	}
	symbols, err := admittedSymbols(*admissions)
	if err != nil {
		return err
	}
	chain, err := solana.New(mainnetEndpoint(), solana.Options{})
	if err != nil {
		return fmt.Errorf("configuring the mainnet reader: %w", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	pool, err := store.OpenPool(ctx, dsn)
	if err != nil {
		return fmt.Errorf("opening SEAMETRY_DATABASE_URL: %w", err)
	}
	defer pool.Close()
	result, err := execution.NewReport(pool).ImportFromFeeAccount(ctx, chain, feeWallet, since, symbols, time.Now())
	slog.Info("seametry: imported activity", "fee_account", result.FeeAccount, "imported", result.Imported, "fee_atoms", result.FeeAtoms.String(),
		"already_recorded", result.AlreadyRecorded, "skipped", fmt.Sprint(result.Skipped), "endpoint", solana.RedactEndpoint(mainnetEndpoint()))
	return err
}
