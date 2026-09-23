package policy

import (
	"encoding/base64"
	"encoding/json"
	"flag"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/BeyndtechArc/Seametry/internal/registry"
)

// -update rewrites the golden file. It exists so that an intended change is a
// visible diff in a reviewed commit, rather than a test someone edited to make
// the code pass.
var update = flag.Bool("update", false, "rewrite spec/policy/golden/decisions.json")

const goldenPath = "../../spec/policy/golden/decisions.json"

// referenceTime pins every decision. A policy that read the clock could not be
// reproduced, and a receipt citing it would be unverifiable a day later.
var referenceTime = time.Date(2026, 9, 23, 12, 0, 0, 0, time.UTC)

type goldenCase struct {
	Name   string `json:"name"`
	Input  Input  `json:"input"`
	Result Result `json:"result"`
}

type goldenFile struct {
	Note   string       `json:"note"`
	Policy Document     `json:"policy"`
	Cases  []goldenCase `json:"cases"`
}

type fixture struct {
	Symbol     string `json:"symbol"`
	Address    string `json:"address"`
	Slot       uint64 `json:"slot"`
	DataBase64 string `json:"data_base64"`
}

// inputsFromFixtures builds decision inputs from real mainnet mints, so the
// golden file pins behaviour against instruments that actually exist rather
// than against ones convenient to the rules.
func inputsFromFixtures(t *testing.T) []Input {
	t.Helper()
	dir := filepath.Join("..", "..", "fixtures", "mainnet")
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("read %s: %v", dir, err)
	}
	var out []Input
	for _, entry := range entries {
		if entry.IsDir() || entry.Name() == "targets.json" || filepath.Ext(entry.Name()) != ".json" {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(dir, entry.Name()))
		if err != nil {
			t.Fatal(err)
		}
		var f fixture
		if err := json.Unmarshal(raw, &f); err != nil {
			t.Fatal(err)
		}
		data, err := base64.StdEncoding.DecodeString(f.DataBase64)
		if err != nil {
			t.Fatal(err)
		}
		mint, err := registry.DecodeMint(data)
		if err != nil {
			t.Fatalf("%s: %v", f.Symbol, err)
		}
		// Halted state is not in the mint; TQQQx and CRDAx were halted at
		// capture, per their fixture notes.
		halted := f.Symbol == "TQQQx" || f.Symbol == "CRDAx"
		in, err := FromRegistry(f.Symbol, f.Address, "certificate", mint, referenceTime, f.Slot, halted, false)
		if err != nil {
			t.Fatalf("%s: %v", f.Symbol, err)
		}
		out = append(out, in)
	}
	if len(out) == 0 {
		t.Fatal("no fixtures; run: go run ./tools/capture")
	}
	return out
}

// synthetic covers the blocking paths that no real xStocks mint exhibits.
// Without these the golden file would only prove the happy path, since every
// live mint currently lands on the same decision.
func synthetic() []Input {
	base := func(symbol string) Input {
		return Input{
			Symbol: symbol, Mint: "SyntheticMint" + symbol, Grade: "certificate",
			AsOf: referenceTime, ObservedAtSlot: 1,
			UnknownExtensions: []string{},
			MultiplierState:   MultiplierFacts{Present: true, Resolved: true, LiveValue: "1", NaiveValue: "1"},
		}
	}
	ungraded := base("UNGRADED")
	ungraded.Grade = "ungraded"

	paused := base("PAUSED")
	paused.Prerogatives.Pausable = true
	paused.Prerogatives.PausedNow = true

	frozenDefault := base("FROZENDEFAULT")
	frozenDefault.Prerogatives.FreezesNewAccounts = true

	activeHook := base("ACTIVEHOOK")
	activeHook.Prerogatives.TransferHookState = "active"
	activeHook.Prerogatives.TransferHookProgram = "HookProgramNobodyHasRead111111111111111111"

	nonTransferable := base("NONTRANSFERABLE")
	nonTransferable.Prerogatives.NonTransferable = true

	quarantined := base("QUARANTINED")
	quarantined.Quarantined = true

	unresolved := base("UNRESOLVED")
	unresolved.MultiplierState = MultiplierFacts{Present: true, Resolved: false}

	unknownExt := base("UNKNOWNEXT")
	unknownExt.UnknownExtensions = []string{"Unknown(60000)"}

	clean := base("CLEAN")

	return []Input{ungraded, paused, frozenDefault, activeHook, nonTransferable,
		quarantined, unresolved, unknownExt, clean}
}

func buildGolden(t *testing.T) goldenFile {
	t.Helper()
	doc := Default()
	file := goldenFile{
		Note: "Decisions pinned against real mainnet mints plus synthetic cases for the " +
			"blocking paths no live xStocks mint currently exhibits. Regenerate with " +
			"go test ./internal/policy -update. A case is never edited by hand to make code pass.",
		Policy: doc,
	}
	for _, in := range append(inputsFromFixtures(t), synthetic()...) {
		result, err := Evaluate(doc, in)
		if err != nil {
			t.Fatalf("%s: %v", in.Symbol, err)
		}
		file.Cases = append(file.Cases, goldenCase{Name: in.Symbol, Input: in, Result: result})
	}
	return file
}

func TestGoldenDecisions(t *testing.T) {
	built := buildGolden(t)

	if *update {
		body, err := json.MarshalIndent(built, "", "  ")
		if err != nil {
			t.Fatal(err)
		}
		if err := os.MkdirAll(filepath.Dir(goldenPath), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(goldenPath, append(body, '\n'), 0o644); err != nil {
			t.Fatal(err)
		}
		t.Logf("wrote %s with %d cases", goldenPath, len(built.Cases))
		return
	}

	raw, err := os.ReadFile(goldenPath)
	if err != nil {
		t.Fatalf("read %s: %v (generate it with: go test ./internal/policy -update)", goldenPath, err)
	}
	var want goldenFile
	if err := json.Unmarshal(raw, &want); err != nil {
		t.Fatal(err)
	}
	if len(want.Cases) != len(built.Cases) {
		t.Fatalf("golden holds %d cases, the build produced %d; regenerate with -update if that is intended",
			len(want.Cases), len(built.Cases))
	}
	for i, expected := range want.Cases {
		got := built.Cases[i]
		t.Run(expected.Name, func(t *testing.T) {
			if got.Result.Decision != expected.Result.Decision {
				t.Errorf("decision changed: was %s, now %s", expected.Result.Decision, got.Result.Decision)
			}
			if got.Result.InputDigest != expected.Result.InputDigest {
				t.Errorf("input digest changed, so the inputs are not what they were:\n  was %s\n  now %s",
					expected.Result.InputDigest, got.Result.InputDigest)
			}
			if len(got.Result.Reasons) != len(expected.Result.Reasons) {
				t.Fatalf("reason count changed: was %d, now %d", len(expected.Result.Reasons), len(got.Result.Reasons))
			}
			for j, wantReason := range expected.Result.Reasons {
				gotReason := got.Result.Reasons[j]
				if gotReason.Code != wantReason.Code {
					t.Errorf("reason %d code: was %s, now %s", j, wantReason.Code, gotReason.Code)
				}
				if gotReason.Severity != wantReason.Severity {
					t.Errorf("reason %d severity: was %s, now %s", j, wantReason.Severity, gotReason.Severity)
				}
				if gotReason.Fact != wantReason.Fact {
					t.Errorf("reason %d wording changed, which a receipt may already cite:\n  was %q\n  now %q",
						j, wantReason.Fact, gotReason.Fact)
				}
			}
		})
	}
}

// Determinism is the property a recorded decision rests on.
func TestEvaluateIsDeterministic(t *testing.T) {
	doc := Default()
	for _, in := range inputsFromFixtures(t) {
		first, err := Evaluate(doc, in)
		if err != nil {
			t.Fatal(err)
		}
		for i := 0; i < 50; i++ {
			again, err := Evaluate(doc, in)
			if err != nil {
				t.Fatal(err)
			}
			if again.InputDigest != first.InputDigest || again.Decision != first.Decision {
				t.Fatalf("%s: run %d differed", in.Symbol, i)
			}
			if len(again.Reasons) != len(first.Reasons) {
				t.Fatalf("%s: reason count varies between runs", in.Symbol)
			}
			for j := range again.Reasons {
				if again.Reasons[j] != first.Reasons[j] {
					t.Fatalf("%s: reason %d varies between runs, so ordering is unstable", in.Symbol, j)
				}
			}
		}
	}
}

// Changing the policy must change decisions without any code change. That is
// what "policy is data" has to mean in practice.
func TestPolicyChangeAltersDecisionsWithoutCodeChange(t *testing.T) {
	in := synthetic()[7] // UNKNOWNEXT
	if len(in.UnknownExtensions) == 0 {
		t.Fatal("precondition: this case must carry an unknown extension")
	}

	lenient := Default()
	strict := Default()
	strict.Version = "policy-test-strict"
	strict.BlockOnUnknownExtension = true

	lenientResult, err := Evaluate(lenient, in)
	if err != nil {
		t.Fatal(err)
	}
	strictResult, err := Evaluate(strict, in)
	if err != nil {
		t.Fatal(err)
	}

	if lenientResult.Decision != Warn {
		t.Errorf("under the default policy an unknown extension warns, got %s", lenientResult.Decision)
	}
	if strictResult.Decision != Block {
		t.Errorf("under the strict policy it blocks, got %s", strictResult.Decision)
	}
	if lenientResult.InputDigest != strictResult.InputDigest {
		t.Error("the inputs did not change, so the input digest must not either")
	}
	if lenientResult.PolicyVersion == strictResult.PolicyVersion {
		t.Error("each decision must record which policy produced it")
	}
}

// A block is never advice and never mentions what a holder should do.
func TestNoReasonRecommends(t *testing.T) {
	doc := Default()
	banned := []string{"should", "recommend", "advis", "you must", "we suggest",
		"safe", "unsafe", "risky", "good investment", "avoid"}

	for _, in := range append(inputsFromFixtures(t), synthetic()...) {
		result, err := Evaluate(doc, in)
		if err != nil {
			t.Fatal(err)
		}
		for _, reason := range result.Reasons {
			lower := strings.ToLower(reason.Fact)
			for _, word := range banned {
				if strings.Contains(lower, word) {
					t.Errorf("%s: reason %s advises or judges: %q (contains %q)",
						in.Symbol, reason.Code, reason.Fact, word)
				}
			}
			if !strings.HasSuffix(reason.Fact, ".") {
				t.Errorf("%s: reason %s is not a sentence: %q", in.Symbol, reason.Code, reason.Fact)
			}
		}
	}
}

// Every real mint currently carries the same three powers, so a policy that
// silently stopped reporting them would still look fine on the happy path.
func TestRealMintsAllReportIssuerPowers(t *testing.T) {
	doc := Default()
	for _, in := range inputsFromFixtures(t) {
		result, err := Evaluate(doc, in)
		if err != nil {
			t.Fatal(err)
		}
		found := map[Code]bool{}
		for _, r := range result.Reasons {
			found[r.Code] = true
		}
		for _, required := range []Code{CodePermanentDelegate, CodeFreezeAuthority, CodeHookCanBeEnabled, CodeMultiplierAuthority} {
			if !found[required] {
				t.Errorf("%s: expected %s to be reported, since every xStocks mint carries it", in.Symbol, required)
			}
		}
	}
}

func TestBlockBeatsWarn(t *testing.T) {
	doc := Default()
	in := synthetic()[1] // PAUSED, which also carries warnings
	result, err := Evaluate(doc, in)
	if err != nil {
		t.Fatal(err)
	}
	if result.Decision != Block {
		t.Fatalf("decision %s, want BLOCK", result.Decision)
	}
	if result.Reasons[0].Severity != Block {
		t.Errorf("the most severe reason must lead, got %s", result.Reasons[0].Severity)
	}
}

func TestInputDigestChangesWithInputs(t *testing.T) {
	doc := Default()
	a := synthetic()[8] // CLEAN
	b := a
	b.ObservedAtSlot = a.ObservedAtSlot + 1

	first, err := Evaluate(doc, a)
	if err != nil {
		t.Fatal(err)
	}
	second, err := Evaluate(doc, b)
	if err != nil {
		t.Fatal(err)
	}
	if first.InputDigest == second.InputDigest {
		t.Fatal("a decision must be bound to the chain state it was made against")
	}
	if first.Decision != second.Decision {
		t.Error("the slot alone should not change the decision")
	}
}
