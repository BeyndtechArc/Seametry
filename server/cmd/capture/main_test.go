package main

import (
	"strings"
	"testing"
)

func TestSelectTargetsCapturesOnlyWhatItNames(t *testing.T) {
	targets := []Target{{Symbol: "AAPLx"}, {Symbol: "SPCX"}, {Symbol: "NFLX"}}

	all, err := selectTargets(targets, "")
	if err != nil || len(all) != 3 {
		t.Fatalf("an empty list kept %d targets (%v), want all 3", len(all), err)
	}

	named, err := selectTargets(targets, "NFLX, SPCX")
	if err != nil {
		t.Fatal(err)
	}
	if len(named) != 2 || named[0].Symbol != "NFLX" || named[1].Symbol != "SPCX" {
		t.Fatalf("kept %+v, want NFLX then SPCX", named)
	}

	if _, err := selectTargets(targets, "SPCX,SPCXX"); err == nil || !strings.Contains(err.Error(), `"SPCXX"`) {
		t.Fatalf("a symbol targets.json does not list was not refused by name: %v", err)
	}
}
