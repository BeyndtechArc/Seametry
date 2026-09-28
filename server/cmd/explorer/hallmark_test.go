package main

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/BeyndtechArc/Seametry/server/internal/receipt"
)

func TestDistinctGradesKeepsFirstSeenOrderAndNeverRanks(t *testing.T) {
	cs := []receipt.Constituent{{Grade: "interest"}, {Grade: "certificate"}, {Grade: "interest"}, {Grade: "entitlement"}, {Grade: "certificate"}}
	want := []string{"interest", "certificate", "entitlement"}
	if got := distinctGrades(cs); !reflect.DeepEqual(got, want) {
		t.Errorf("distinctGrades = %v, want %v: order is first met, never sorted, because no order between grades is defined", got, want)
	}
	if got := distinctGrades(nil); len(got) != 0 {
		t.Errorf("distinctGrades(nil) = %v, want none", got)
	}
}

func testProofs() []receipt.Proof {
	mk := func(serial string, sentences ...string) receipt.Proof {
		return receipt.Proof{
			Serial: receipt.Serial(serial),
			Public: receipt.PublicBody{
				Serial: serial, Kind: receipt.KindStrike, Month: "2026-09", Basket: "Alloy No. 1",
				Constituents:    []receipt.Constituent{{Ticker: "AAPLx", Mint: "MintAddr1", Grade: "certificate", IssuerCan: sentences}},
				WeakestEvidence: "verified", SizeBand: receipt.Band1000To10000, Venues: []string{"Hall"},
				PolicyVersion: "policy-test.1", Settlement: "finalized", Office: "Test Office",
			},
			PrivateCommitment: "00", Root: "ab",
		}
	}
	return []receipt.Proof{
		mk("09260000001", "The issuer can freeze this where it sits."),
		mk("09260000002", "<script>alert(1)</script>"),
	}
}

// One page per serial, each reachable by its own file, each carrying its own
// serial to the ritual and never claiming a seal it does not have.
func TestWriteHallmarkPagesWritesOnePagePerSerial(t *testing.T) {
	dir := t.TempDir()
	proofs := testProofs()
	base := page{BatchCount: len(proofs), BatchRoot: "abcdef", Instruments: []Instrument{{Symbol: "AAPLx"}}}

	if n := writeHallmarkPages(dir, loadTemplates(), base, proofs); n != len(proofs) {
		t.Fatalf("wrote %d pages, want %d", n, len(proofs))
	}

	for _, p := range proofs {
		serial := string(p.Serial)
		raw, err := os.ReadFile(filepath.Join(dir, "hallmark-"+serial+".html"))
		if err != nil {
			t.Fatalf("no page for serial %s: %v", serial, err)
		}
		html := string(raw)
		for _, want := range []string{
			`<h1 class="serial">` + serial + `</h1>`,
			`data-prefill="` + serial + `"`,
			`src="verify.js"`,
			"It is not written on-chain yet",
			`href="instruments.html#AAPLx"`,
		} {
			if !strings.Contains(html, want) {
				t.Errorf("page for %s is missing %q", serial, want)
			}
		}
		if strings.Contains(html, `aria-current="page"`) {
			t.Errorf("page for %s marks a nav item as current; no nav item is a hallmark", serial)
		}
	}

	second, _ := os.ReadFile(filepath.Join(dir, "hallmark-09260000002.html"))
	if strings.Contains(string(second), "<script>alert(1)</script>") {
		t.Error("a sentence in a public body reached the page as markup; the body is data, never HTML")
	}
}
