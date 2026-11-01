package main

import (
	"strings"
	"testing"
)

func TestImportLedgerTakesThePathBeforeItsFlags(t *testing.T) {
	options, err := parseLedgerArgs([]string{"leads.json", "--dry-run"})
	if err != nil {
		t.Fatal(err)
	}
	if options.path != "leads.json" || !options.dryRun {
		t.Errorf("parsed %+v", options)
	}
}

func TestARealImportCannotStartWithoutItsLawfulBasis(t *testing.T) {
	for _, args := range [][]string{
		{"leads.json"},
		{"leads.json", "--lawful-basis", "legitimate_interest"},
		{"leads.json", "--basis-note", "assessment of 2026-10-31"},
	} {
		if _, err := parseLedgerArgs(args); err == nil || !strings.Contains(err.Error(), "--lawful-basis") {
			t.Errorf("%v answered %v; want it refused, naming the flag", args, err)
		}
	}
}
