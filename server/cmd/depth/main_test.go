package main

import (
	"strings"
	"testing"
)

func TestSelectMintsMeasuresOnlyWhatItNames(t *testing.T) {
	all := []mint{{symbol: "AAPLx"}, {symbol: "MU"}, {symbol: "MUx"}}

	kept, err := selectMints(all, "")
	if err != nil || len(kept) != 3 {
		t.Fatalf("an empty list kept %d instruments (%v), want all 3", len(kept), err)
	}

	kept, err = selectMints(all, "MU")
	if err != nil {
		t.Fatal(err)
	}
	if len(kept) != 1 || kept[0].symbol != "MU" {
		t.Fatalf("kept %+v, want only MU, not MUx", kept)
	}

	if _, err := selectMints(all, "MU,BE"); err == nil || !strings.Contains(err.Error(), "-symbols BE") {
		t.Fatalf("a symbol with no fixture was not refused with the capture command to run: %v", err)
	}
}
