package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/BeyndtechArc/Seametry/server/internal/growth"
	"github.com/BeyndtechArc/Seametry/server/internal/store"
)

const growthUsage = `usage: seametry growth import-ledger <path> --dry-run
       seametry growth import-ledger <path> --lawful-basis <basis> --basis-note <where it is recorded>
       seametry growth remove-import <batch>`

type ledgerOptions struct {
	path, lawfulBasis, basisNote string
	dryRun                       bool
}

// parseLedgerArgs reads the path first, as the plan's command puts it; the
// flag package stops at the first argument that is not a flag.
func parseLedgerArgs(args []string) (ledgerOptions, error) {
	if len(args) == 0 {
		return ledgerOptions{}, errors.New("import-ledger needs the path of a lead file; " + growthUsage)
	}
	options := ledgerOptions{path: args[0]}
	flags := flag.NewFlagSet("import-ledger", flag.ContinueOnError)
	flags.BoolVar(&options.dryRun, "dry-run", false, "print the diff and write nothing")
	flags.StringVar(&options.lawfulBasis, "lawful-basis", "", "consent, legitimate_interest or contract")
	flags.StringVar(&options.basisNote, "basis-note", "", "where the lawful basis is recorded")
	if err := flags.Parse(args[1:]); err != nil {
		return ledgerOptions{}, err
	}
	if flags.NArg() > 0 {
		return ledgerOptions{}, fmt.Errorf("import-ledger takes one path, and also got %q; %s", flags.Arg(0), growthUsage)
	}
	if !options.dryRun && (options.lawfulBasis == "" || options.basisNote == "") {
		return ledgerOptions{}, errors.New("a real import needs --lawful-basis and --basis-note, or --dry-run to only see the diff; " + growthUsage)
	}
	return options, nil
}

func growthCommand(args []string) error {
	if len(args) == 0 {
		return errors.New(growthUsage)
	}
	dsn := os.Getenv("SEAMETRY_DATABASE_URL")
	if dsn == "" {
		return errors.New("seametry growth needs SEAMETRY_DATABASE_URL")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	switch args[0] {
	case "import-ledger":
		options, err := parseLedgerArgs(args[1:])
		if err != nil {
			return err
		}
		return importLedger(ctx, dsn, options)
	case "remove-import":
		if len(args) != 2 {
			return errors.New("remove-import takes the batch an import printed; " + growthUsage)
		}
		pool, err := store.OpenPool(ctx, dsn)
		if err != nil {
			return fmt.Errorf("opening SEAMETRY_DATABASE_URL: %w", err)
		}
		defer pool.Close()
		removed, err := growth.NewPeople(pool).RemoveImport(ctx, args[1])
		if err != nil {
			return err
		}
		slog.Info("seametry: removed an import", "batch", args[1], "people", removed)
		return nil
	default:
		return fmt.Errorf("unknown growth command %q; %s", args[0], growthUsage)
	}
}

func importLedger(ctx context.Context, dsn string, options ledgerOptions) error {
	raw, err := os.ReadFile(options.path)
	if err != nil {
		return fmt.Errorf("reading the lead file: %w", err)
	}
	ledger, err := growth.ParseLedger(raw)
	if err != nil {
		return err
	}
	pool, err := store.OpenPool(ctx, dsn)
	if err != nil {
		return fmt.Errorf("opening SEAMETRY_DATABASE_URL: %w", err)
	}
	defer pool.Close()
	people := growth.NewPeople(pool)
	var diff growth.ImportDiff
	if options.dryRun {
		diff, err = people.Diff(ctx, ledger)
	} else {
		diff, err = people.Import(ctx, ledger, options.lawfulBasis, options.basisNote, time.Now())
	}
	if err != nil {
		return err
	}
	fmt.Printf("batch %s (dry run: %t)\nnew %d, changed %d, unchanged %d, held but not in this file %d\nidentities by kind %v\nvalues shared by more than one lead, by kind %v\n",
		diff.Batch, options.dryRun, len(diff.New), len(diff.Changed), diff.Unchanged, diff.NotInFile, diff.Identities, diff.SharedIdentities)
	for _, id := range diff.Changed {
		fmt.Println("changed", id)
	}
	return nil
}
