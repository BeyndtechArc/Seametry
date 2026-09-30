package main

import (
	"encoding/json"
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
			`href="lot-AAPLx.html"`,
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

func writeAnchor(t *testing.T, dir, name string, a batchAnchor) {
	t.Helper()
	raw, err := json.Marshal(a)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, name+".json"), raw, 0o644); err != nil {
		t.Fatal(err)
	}
}

// An anchor file is published only when it anchors this root, finalized on
// devnet: the page links the transaction and says what its memo reads.
func TestLoadAnchorRefusesEvidenceThatDoesNotAnchorThisRoot(t *testing.T) {
	const root = "668599c1eb1d299c1383e9efa712774aa1adeaedc4914a7ea8846efee34fbf89"
	good := batchAnchor{
		Root: root, Memo: string(receipt.AnchorMemo(root)), Cluster: "devnet", Commitment: "finalized",
		Transaction: "5aMemoSignature", Key: "AnchorKey1111111111111111111111111111111111", Slot: 42,
	}

	dir := t.TempDir()
	if a, err := loadAnchor(dir, root); a != nil || err != nil {
		t.Fatalf("with no evidence, loadAnchor = %v, %v; want nothing and no error", a, err)
	}
	writeAnchor(t, dir, root, good)
	if a, err := loadAnchor(dir, root); err != nil || a == nil || a.Transaction != good.Transaction {
		t.Fatalf("loadAnchor = %+v, %v; want the written anchor", a, err)
	}

	for name, change := range map[string]func(*batchAnchor){
		"another root's memo": func(a *batchAnchor) { a.Memo = string(receipt.AnchorMemo(strings.Repeat("00", 32))) },
		"another root":        func(a *batchAnchor) { a.Root = strings.Repeat("00", 32) },
		"mainnet":             func(a *batchAnchor) { a.Cluster = "mainnet" },
		"only confirmed":      func(a *batchAnchor) { a.Commitment = "confirmed" },
		"no transaction":      func(a *batchAnchor) { a.Transaction = "" },
	} {
		t.Run(name, func(t *testing.T) {
			bad := good
			change(&bad)
			dir := t.TempDir()
			writeAnchor(t, dir, root, bad)
			if _, err := loadAnchor(dir, root); err == nil {
				t.Errorf("evidence with %s was accepted", name)
			}
		})
	}
}

func TestHallmarkPageLinksItsAnchorOnceThereIsOne(t *testing.T) {
	dir := t.TempDir()
	proofs := testProofs()
	anchor := &batchAnchor{Memo: "seametry-root-v1:abcdef", Transaction: "5aMemoSignature", Key: "AnchorKey111", Slot: 42}
	base := page{BatchCount: len(proofs), BatchRoot: "abcdef", Anchor: anchor}
	writeHallmarkPages(dir, loadTemplates(), base, proofs)

	raw, err := os.ReadFile(filepath.Join(dir, "hallmark-"+string(proofs[0].Serial)+".html"))
	if err != nil {
		t.Fatal(err)
	}
	html := string(raw)
	for _, want := range []string{`href="https://explorer.solana.com/tx/5aMemoSignature?cluster=devnet"`, "seametry-root-v1:abcdef", "slot 42", "AnchorKey111"} {
		if !strings.Contains(html, want) {
			t.Errorf("anchored hallmark page is missing %q", want)
		}
	}
	if strings.Contains(html, "not written on-chain yet") {
		t.Error("an anchored hallmark page still says its root is not on chain")
	}
}
