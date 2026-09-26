package main

import (
	"bytes"
	"encoding/json"
	"math/big"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"testing"

	"github.com/BeyndtechArc/Seametry/internal/basket"
)

func TestCommasWritesWholeUnitsWithSeparators(t *testing.T) {
	for _, c := range []struct {
		in   uint64
		want string
	}{
		{0, "0"}, {7, "7"}, {999, "999"}, {1000, "1,000"},
		{5003000, "5,003,000"}, {18446744073709551615, "18,446,744,073,709,551,615"},
	} {
		if got := commas(c.in); got != c.want {
			t.Errorf("commas(%d) = %q, want %q", c.in, got, c.want)
		}
	}
}

// The transcript is written by the Rust tests and read here, with nothing else
// linking the two. If the producer adds a field this page does not know, the
// page would drop it silently, so the decode refuses unknown fields.
func TestTranscriptDecodesWithoutDroppingAnyField(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "evidence", "hall-demo", "transcript.json"))
	if err != nil {
		t.Fatal(err)
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	var tr Transcript
	if err := dec.Decode(&tr); err != nil {
		t.Fatalf("the transcript has a shape this page does not read: %v", err)
	}

	if len(tr.Scenario) == 0 {
		t.Fatal("no scenarios decoded")
	}
	for _, s := range tr.Scenario {
		if s.Title == "" || s.Shows == "" || s.DoesNotShow == "" || len(s.Steps) == 0 {
			t.Errorf("scenario %q is missing a title, a claim, its limits or its steps", s.ID)
		}
		for _, m := range s.Steps {
			if m.Result != "ok" && m.Result != "refused" {
				t.Errorf("scenario %q: result %q is neither ok nor refused, and the page would show it as refused", s.ID, m.Result)
			}
			if m.Result == "refused" && m.Reason == "" {
				t.Errorf("scenario %q: a refusal with no reason", s.ID)
			}
		}
	}
	if tr.Producer.Kind == "" || tr.Producer.Description == "" {
		t.Error("the producer is not stated, so the page could not say what produced it")
	}
	if tr.Producer.Cluster == nil && tr.Producer.Signatures {
		t.Error("the transcript claims signatures but names no cluster")
	}
}

func readTranscript(t *testing.T) *Transcript {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("..", "..", "evidence", "hall-demo", "transcript.json"))
	if err != nil {
		t.Fatal(err)
	}
	var tr Transcript
	if err := json.Unmarshal(raw, &tr); err != nil {
		t.Fatal(err)
	}
	return &tr
}

var sharesAction = regexp.MustCompile(`^(strike|melt) ([0-9,]+) shares$`)

// The Rust program produced the transcript and Go computes the cost table, so
// this is two implementations of the same arithmetic meeting on real output.
// For every strike and melt that succeeded, what the program took or credited
// must equal what internal/basket says it should have.
func TestGoArithmeticAgreesWithWhatTheProgramDid(t *testing.T) {
	tr := readTranscript(t)
	checked := 0
	for _, s := range tr.Scenario {
		for i, m := range s.Steps {
			match := sharesAction.FindStringSubmatch(m.Action)
			if match == nil || m.Result != "ok" || i == 0 || s.Steps[i-1].State == nil {
				continue
			}
			shares, err := strconv.ParseUint(strings.ReplaceAll(match[2], ",", ""), 10, 64)
			if err != nil {
				t.Fatal(err)
			}
			before, after := s.Steps[i-1].State, m.State
			supply := new(big.Int).SetUint64(before.Supply)
			n := new(big.Int).SetUint64(shares)

			for j, leg := range before.Legs {
				c := basket.Constituent{Mint: leg.Stock, Ledger: units(leg.Ledger, 6)}
				var want, got uint64
				if match[1] == "strike" {
					a, err := basket.RequiredIn(c, n, supply)
					if err != nil {
						t.Fatal(err)
					}
					want, got = a.Atoms().Uint64(), after.Legs[j].Ledger-leg.Ledger
				} else {
					a, err := basket.Out(c, n, supply)
					if err != nil {
						t.Fatal(err)
					}
					want, got = a.Atoms().Uint64(), after.Holder.Claims[j]-before.Holder.Claims[j]
				}
				if got != want {
					t.Errorf("%s, %q, stock %s: the program moved %d and internal/basket computes %d", s.ID, m.Action, leg.Stock, got, want)
				}
			}
			checked++
		}
	}
	if checked == 0 {
		t.Fatal("no strike or melt in the transcript could be checked")
	}
}

func TestCostTableKeepsTheRoundingWithTheHall(t *testing.T) {
	table := costTable(readTranscript(t))
	if table == nil {
		t.Fatal("no cost table could be built from the transcript")
	}
	rounded := false
	for _, row := range table.Rows {
		for j := range row.In {
			if row.Out[j] > row.In[j] {
				t.Errorf("%d shares of %s: a melt returned %d after a strike took %d, so the round trip profited", row.Shares, table.Stocks[j], row.Out[j], row.In[j])
			}
			if row.Kept[j] != row.In[j]-row.Out[j] {
				t.Errorf("%d shares of %s: kept %d, want %d", row.Shares, table.Stocks[j], row.Kept[j], row.In[j]-row.Out[j])
			}
			if row.Kept[j] > 0 {
				rounded = true
			}
		}
	}
	if !rounded {
		t.Error("no row shows any rounding, so the table cannot illustrate that the Hall keeps it")
	}
}
