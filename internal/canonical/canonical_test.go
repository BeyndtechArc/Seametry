package canonical

import (
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"testing"
	"unicode/utf16"
)

// vectorFile mirrors spec/canonical/vectors.json. That file binds this package,
// the browser side verifier in the Explorer, and the Rust program. It is never
// edited to make this test pass. See docs/ENGINEERING_STANDARD.md section 17.
type vectorFile struct {
	Scheme  string `json:"scheme"`
	Accepts []struct {
		Name      string          `json:"name"`
		Input     json.RawMessage `json:"input"`
		Canonical string          `json:"canonical"`
		Catches   string          `json:"catches,omitempty"`
	} `json:"accepts"`
	Rejects []struct {
		Name   string          `json:"name"`
		Input  json.RawMessage `json:"input"`
		Reason string          `json:"reason"`
	} `json:"rejects"`
}

func loadVectors(t *testing.T) vectorFile {
	t.Helper()
	path := filepath.Join("..", "..", "spec", "canonical", "vectors.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	var vf vectorFile
	if err := json.Unmarshal(raw, &vf); err != nil {
		t.Fatalf("parse %s: %v", path, err)
	}
	if len(vf.Accepts) == 0 || len(vf.Rejects) == 0 {
		t.Fatalf("%s is empty; run: node tools/spec/generate.mjs", path)
	}
	return vf
}

func TestVectorsAccept(t *testing.T) {
	vf := loadVectors(t)
	for _, v := range vf.Accepts {
		t.Run(v.Name, func(t *testing.T) {
			input, err := Decode(v.Input)
			if err != nil {
				t.Fatalf("decode vector input: %v", err)
			}
			got, err := Marshal(input)
			if err != nil {
				t.Fatalf("Marshal errored on an accepted vector: %v", err)
			}
			if string(got) != v.Canonical {
				t.Errorf("canonical form differs\n  want %s\n  got  %s", v.Canonical, got)
				if v.Catches != "" {
					t.Logf("this vector exists to catch: %s", v.Catches)
				}
			}
		})
	}
}

func TestVectorsReject(t *testing.T) {
	vf := loadVectors(t)
	for _, v := range vf.Rejects {
		t.Run(v.Name, func(t *testing.T) {
			input, err := Decode(v.Input)
			if err != nil {
				return // refused at decode, which is still a refusal
			}
			got, err := Marshal(input)
			if err == nil {
				t.Fatalf("accepted a vector that must be refused (%s); produced %s", v.Reason, got)
			}
		})
	}
}

// Determinism is the property the receipt scheme rests on, so it is asserted
// directly rather than inferred from the vectors passing.
func TestInsertionOrderDoesNotMatter(t *testing.T) {
	a := map[string]any{"a": 1, "b": map[string]any{"c": 2, "d": 3}}
	b := map[string]any{"b": map[string]any{"d": 3, "c": 2}, "a": 1}
	ha, err := Digest(a)
	if err != nil {
		t.Fatal(err)
	}
	hb, err := Digest(b)
	if err != nil {
		t.Fatal(err)
	}
	if ha != hb {
		t.Fatalf("digest depends on insertion order: %x vs %x", ha, hb)
	}
}

func TestRepeatedMarshalIsStable(t *testing.T) {
	v := map[string]any{"z": []any{1, 2, 3}, "a": "x", "é": true, "\U00010000": nil}
	first, err := Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 200; i++ {
		again, err := Marshal(v)
		if err != nil {
			t.Fatal(err)
		}
		if string(again) != string(first) {
			t.Fatalf("iteration %d differs\n  first %s\n  again %s", i, first, again)
		}
	}
}

// Floats are refused at the type level, not only when they carry a fraction.
// A float64 holding a whole number is still a float64, and admitting it would
// reopen the class of defect the rule exists to close.
func TestFloatsAreAlwaysRefused(t *testing.T) {
	for _, v := range []any{
		map[string]any{"n": float64(1.5)},
		map[string]any{"n": float64(2)},
		map[string]any{"n": float32(0)},
		map[string]any{"n": math.Inf(1)},
		map[string]any{"n": math.Inf(-1)},
		map[string]any{"n": math.NaN()},
		map[string]any{"a": []any{float64(1)}},
	} {
		if _, err := Marshal(v); err == nil {
			t.Errorf("accepted a floating point value: %#v", v)
		}
	}
}

// Structs route through encoding/json before canonicalization, so that path
// must not be able to launder a float into a JSON number.
func TestStructWithFloatIsRefused(t *testing.T) {
	type quote struct {
		Symbol string  `json:"symbol"`
		Price  float64 `json:"price"`
	}
	if _, err := Marshal(quote{Symbol: "AAPLx", Price: 248.37}); err == nil {
		t.Fatal("a struct carrying a float64 price was accepted")
	}
}

func TestStructWithIntegerAtomsIsAccepted(t *testing.T) {
	type amount struct {
		Atoms string `json:"amount_atoms"`
		Scale int    `json:"scale"`
	}
	got, err := Marshal(amount{Atoms: "24837000000", Scale: 8})
	if err != nil {
		t.Fatalf("integer atoms plus scale must be canonical: %v", err)
	}
	const want = `{"amount_atoms":"24837000000","scale":8}`
	if string(got) != want {
		t.Fatalf("want %s got %s", want, got)
	}
}

func TestInvalidUTF8IsRefused(t *testing.T) {
	if _, err := Marshal(map[string]any{"k": string([]byte{0xff, 0xfe})}); err == nil {
		t.Fatal("invalid UTF-8 was accepted")
	}
}

func TestSafeIntegerBoundary(t *testing.T) {
	if _, err := Marshal(map[string]any{"n": int64(MaxSafeInteger)}); err != nil {
		t.Errorf("largest safe integer must be accepted: %v", err)
	}
	if _, err := Marshal(map[string]any{"n": int64(MinSafeInteger)}); err != nil {
		t.Errorf("smallest safe integer must be accepted: %v", err)
	}
	if _, err := Marshal(map[string]any{"n": int64(MaxSafeInteger) + 1}); err == nil {
		t.Error("first unsafe integer must be refused")
	}
	if _, err := Marshal(map[string]any{"n": uint64(1) << 60}); err == nil {
		t.Error("large uint64 must be refused")
	}
}

// lessUTF16General is the unoptimized reference: always encode to UTF-16 code
// units and compare. lessUTF16 takes an ASCII shortcut, and the two must agree
// on every pair, or key ordering would depend on whether a sibling key
// happened to contain a non-ASCII character.
func lessUTF16General(a, b string) bool {
	au := utf16.Encode([]rune(a))
	bu := utf16.Encode([]rune(b))
	for i := 0; i < len(au) && i < len(bu); i++ {
		if au[i] != bu[i] {
			return au[i] < bu[i]
		}
	}
	return len(au) < len(bu)
}

func TestKeyOrderFastPathAgreesWithReference(t *testing.T) {
	keys := []string{
		"", "a", "A", "z", "0", "~", "ab", "aa", "a ",
		"é", "�", "\U00010000", "\U0001F600",
	}
	for _, x := range keys {
		for _, y := range keys {
			if fast, ref := lessUTF16(x, y), lessUTF16General(x, y); fast != ref {
				t.Errorf("ordering disagrees for %q vs %q: fast=%v reference=%v", x, y, fast, ref)
			}
		}
	}
}

// JCS ordering differs from UTF-8 byte ordering exactly here. This is the pair
// that catches an implementation which sorted raw bytes, which is the mistake
// a Go implementation makes by default because sorting Go strings with < is
// byte ordering.
func TestSurrogatePairSortsBeforeReplacementCharacter(t *testing.T) {
	const above = "\U00010000" // UTF-16 D800 DC00, UTF-8 F0 90 80 80
	const fffd = "�"           // UTF-16 FFFD,      UTF-8 EF BF BD

	if !lessUTF16(above, fffd) {
		t.Fatal("U+10000 must sort before U+FFFD in UTF-16 code unit order")
	}
	if !(fffd < above) {
		t.Fatal("precondition failed: in UTF-8 byte order U+FFFD sorts first, which is what makes this pair discriminating")
	}

	got, err := Marshal(map[string]any{fffd: 1, above: 2})
	if err != nil {
		t.Fatal(err)
	}
	want := `{"` + above + `":2,"` + fffd + `":1}`
	if string(got) != want {
		t.Fatalf("want %s got %s", want, got)
	}
}
