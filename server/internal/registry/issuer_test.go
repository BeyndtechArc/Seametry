package registry

import "testing"

func TestEveryFixtureIsRecognisedAsItsIssuer(t *testing.T) {
	for symbol, f := range loadFixtures(t) {
		t.Run(symbol, func(t *testing.T) {
			mint, err := DecodeMint(f.bytes(t))
			if err != nil {
				t.Fatalf("decode: %v", err)
			}
			p, err := mint.Prerogatives()
			if err != nil {
				t.Fatalf("prerogatives: %v", err)
			}
			issuer, ok := p.RecognisedIssuer()
			if !ok {
				t.Fatalf("captured as %q, but its freeze, take-back and pause keys match no recognised issuer", f.Issuer)
			}
			if issuer.Name != f.Issuer {
				t.Fatalf("captured as %q, but its keys are %q's", f.Issuer, issuer.Name)
			}
		})
	}
}

// A copy that names a recognised issuer's freeze key but not its other keys
// is not that issuer's token, and so has no grade to inherit.
func TestAPartialKeyMatchIsUngraded(t *testing.T) {
	key := func(s string) *Pubkey {
		k, err := ParsePubkey(s)
		if err != nil {
			t.Fatal(err)
		}
		return &k
	}
	backpack := key("2cVYpagTt7ZGc3mmTXBa7fAznUtx5DUu6aCq8uVDaf4a")
	p := Prerogatives{FreezeAuthority: backpack, PermanentDelegate: backpack, Pausable: &Pausable{Authority: backpack}}
	if got := p.Grade(); got != GradeEntitlement {
		t.Fatalf("Backpack's own keys grade %q, want %q", got, GradeEntitlement)
	}
	p.PermanentDelegate = key("5aMNNLQJwAEeoemTEMkv5NVjqKwvvefRYCQ5Z67HFvEq")
	if got := p.Grade(); got != GradeUngraded {
		t.Fatalf("Backpack's freeze key with another issuer's take-back key grades %q, want %q", got, GradeUngraded)
	}
	if got := (Prerogatives{}).Grade(); got != GradeUngraded {
		t.Fatalf("a mint with no issuer powers grades %q, want %q", got, GradeUngraded)
	}
}
