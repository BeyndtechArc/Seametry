package main

import (
	"os"
	"path/filepath"
	"testing"
)

// repoRoot walks up from the package directory (server/cmd/seametry) to the
// repository root, so these tests find shared/fixtures and shared/evidence
// regardless of the working directory `go test` was invoked from.
func repoRoot(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 6; i++ {
		if _, err := os.Stat(filepath.Join(dir, "go.work")); err == nil {
			return dir
		}
		dir = filepath.Dir(dir)
	}
	t.Fatal("could not find the repository root (no go.work found above this package)")
	return ""
}

func TestLoadSolanaFixtureInputsReadsEveryFixture(t *testing.T) {
	root := repoRoot(t)
	inputs, err := loadSolanaFixtureInputs(filepath.Join(root, "shared", "fixtures", "mainnet"))
	if err != nil {
		t.Fatal(err)
	}
	// 7 captured mints, not 8: targets.json lists what to capture, not a
	// capture itself, and loadSolanaFixtureInputs skips it by name.
	if len(inputs) != 7 {
		t.Fatalf("loaded %d inputs, want 7 (one per shared/fixtures/mainnet/*.json, excluding targets.json)", len(inputs))
	}
	for _, in := range inputs {
		if in.Mint == "" {
			t.Error("an input has an empty Mint")
		}
		if len(in.Raw) == 0 {
			t.Errorf("%s: Raw is empty", in.Mint)
		}
		if in.SourceEventAt.IsZero() {
			t.Errorf("%s: SourceEventAt was not preserved from the fixture's own captured_at", in.Mint)
		}
		if in.AdapterVersion == "" {
			t.Errorf("%s: AdapterVersion is empty", in.Mint)
		}
	}
}

func TestLoadSolanaFixtureInputsRefusesAnAlteredFixture(t *testing.T) {
	root := repoRoot(t)
	src := filepath.Join(root, "shared", "fixtures", "mainnet", "AAPLx.json")
	original, err := os.ReadFile(src)
	if err != nil {
		t.Fatal(err)
	}

	dir := t.TempDir()
	altered := corruptField(t, original, "data_base64")
	if err := os.WriteFile(filepath.Join(dir, "AAPLx.json"), altered, 0o644); err != nil {
		t.Fatal(err)
	}

	if _, err := loadSolanaFixtureInputs(dir); err == nil {
		t.Fatal("loadSolanaFixtureInputs accepted a fixture whose data_base64 no longer matches data_sha256")
	}
}

// corruptField flips one character inside the given JSON string field's
// value, leaving the rest of the document, including its recorded digest,
// unchanged, the way a real accidental edit would.
func corruptField(t *testing.T, doc []byte, field string) []byte {
	t.Helper()
	marker := []byte(`"` + field + `": "`)
	i := indexOf(doc, marker)
	if i < 0 {
		t.Fatalf("field %q not found in fixture", field)
	}
	valueStart := i + len(marker)
	corrupted := append([]byte{}, doc...)
	if corrupted[valueStart] == 'A' {
		corrupted[valueStart] = 'B'
	} else {
		corrupted[valueStart] = 'A'
	}
	return corrupted
}

// corruptDigitAfter flips one digit immediately after marker, leaving the
// surrounding JSON syntax untouched: the result still parses, with a
// different, still-plausible value, the way a real transcription slip would.
func corruptDigitAfter(t *testing.T, doc []byte, marker string) []byte {
	t.Helper()
	i := indexOf(doc, []byte(marker))
	if i < 0 {
		t.Fatalf("marker %q not found", marker)
	}
	valueStart := i + len(marker)
	corrupted := append([]byte{}, doc...)
	if corrupted[valueStart] == '9' {
		corrupted[valueStart] = '8'
	} else {
		corrupted[valueStart] = '9'
	}
	return corrupted
}

func indexOf(haystack, needle []byte) int {
	for i := 0; i+len(needle) <= len(haystack); i++ {
		if string(haystack[i:i+len(needle)]) == string(needle) {
			return i
		}
	}
	return -1
}

func TestLoadJupiterFixtureInputsReadsEveryPoint(t *testing.T) {
	root := repoRoot(t)
	inputs, err := loadJupiterFixtureInputs(
		filepath.Join(root, "shared", "evidence", "depth-2026-09-24.json"),
		filepath.Join(root, "shared", "fixtures", "jupiter"),
	)
	if err != nil {
		t.Fatal(err)
	}
	// 7 instruments x 3 sizes, counted directly from the evidence file at
	// the start of this session rather than assumed: 21.
	if len(inputs) != 21 {
		t.Fatalf("loaded %d inputs, want 21", len(inputs))
	}
	for _, in := range inputs {
		if len(in.Raw) == 0 {
			t.Errorf("%s: Raw is empty", in.Mint)
		}
		if in.Source != "jupiter:quote" {
			t.Errorf("%s: Source = %q, want jupiter:quote", in.Mint, in.Source)
		}
	}
}

func TestLoadJupiterFixtureInputsRefusesAnAlteredCapture(t *testing.T) {
	root := repoRoot(t)
	src := filepath.Join(root, "shared", "fixtures", "jupiter", "AAPLx-100usdc.json")
	original, err := os.ReadFile(src)
	if err != nil {
		t.Fatal(err)
	}
	// A digit inside outAmount's escaped value, not the leading byte of
	// body itself: flipping the first byte of body breaks it as JSON, which
	// liquidity.Replay would refuse on its own, proving nothing about the
	// sha256 check this test targets. A digit swap keeps body valid JSON
	// with a different, plausible value, so only the digest check catches it.
	altered := corruptDigitAfter(t, original, `\"outAmount\":\"`)

	fixtureDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(fixtureDir, "AAPLx-100usdc.json"), altered, 0o644); err != nil {
		t.Fatal(err)
	}

	reportPath := filepath.Join(t.TempDir(), "report.json")
	if err := os.WriteFile(reportPath, []byte(`{"captured_at":"2026-09-24T00:00:00Z","instruments":[{"symbol":"AAPLx","mint":"X","decimals":8,"points":[{"size_usdc":100}]}]}`), 0o644); err != nil {
		t.Fatal(err)
	}

	if _, err := loadJupiterFixtureInputs(reportPath, fixtureDir); err == nil {
		t.Fatal("loadJupiterFixtureInputs accepted a capture whose body no longer matches sha256")
	}
}
