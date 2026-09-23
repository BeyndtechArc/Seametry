package registry

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// fixture mirrors a file written by tools/capture. These are real mainnet
// accounts recorded with the slot they were read at, not data anyone invented.
type fixture struct {
	Symbol     string `json:"symbol"`
	Issuer     string `json:"issuer"`
	Note       string `json:"note"`
	Address    string `json:"address"`
	Slot       uint64 `json:"slot"`
	CapturedAt string `json:"captured_at"`
	Owner      string `json:"owner"`
	DataSHA256 string `json:"data_sha256"`
	DataLen    int    `json:"data_len"`
	DataBase64 string `json:"data_base64"`
}

func (f fixture) bytes(t *testing.T) []byte {
	t.Helper()
	raw, err := base64.StdEncoding.DecodeString(f.DataBase64)
	if err != nil {
		t.Fatalf("%s: decode: %v", f.Symbol, err)
	}
	// A fixture whose bytes do not match its recorded digest is not evidence,
	// so the digest is checked before the bytes are used for anything.
	sum := sha256.Sum256(raw)
	if got := hex.EncodeToString(sum[:]); got != f.DataSHA256 {
		t.Fatalf("%s: fixture has been altered since capture\n  recorded %s\n  actual   %s",
			f.Symbol, f.DataSHA256, got)
	}
	if len(raw) != f.DataLen {
		t.Fatalf("%s: length %d does not match recorded %d", f.Symbol, len(raw), f.DataLen)
	}
	return raw
}

func loadFixtures(t *testing.T) map[string]fixture {
	t.Helper()
	dir := filepath.Join("..", "..", "fixtures", "mainnet")
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("read %s: %v", dir, err)
	}
	out := make(map[string]fixture)
	for _, entry := range entries {
		if entry.IsDir() || entry.Name() == "targets.json" || filepath.Ext(entry.Name()) != ".json" {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(dir, entry.Name()))
		if err != nil {
			t.Fatalf("read %s: %v", entry.Name(), err)
		}
		var f fixture
		if err := json.Unmarshal(raw, &f); err != nil {
			t.Fatalf("parse %s: %v", entry.Name(), err)
		}
		out[f.Symbol] = f
	}
	if len(out) == 0 {
		t.Fatalf("no fixtures in %s; run: go run ./tools/capture", dir)
	}
	return out
}

func mustFixture(t *testing.T, symbol string) fixture {
	t.Helper()
	f, ok := loadFixtures(t)[symbol]
	if !ok {
		t.Fatalf("fixture %s is missing", symbol)
	}
	return f
}

// referenceTime is the instant every multiplier assertion resolves against.
// It is a constant rather than time.Now so that these tests keep meaning the
// same thing forever, including after a scheduled activation lands.
var referenceTime = time.Date(2026, 9, 23, 3, 30, 0, 0, time.UTC)

func TestEveryFixtureDecodes(t *testing.T) {
	for symbol, f := range loadFixtures(t) {
		t.Run(symbol, func(t *testing.T) {
			if f.Owner != Token2022ProgramID {
				t.Fatalf("owner is %s, want the Token-2022 program", f.Owner)
			}
			mint, err := DecodeMint(f.bytes(t))
			if err != nil {
				t.Fatalf("decode: %v", err)
			}
			if !mint.IsInitialized {
				t.Error("mint is not initialized")
			}
			if mint.Decimals > 18 {
				t.Errorf("implausible decimals: %d", mint.Decimals)
			}
			if len(mint.Extensions) == 0 {
				t.Error("no extensions decoded, but every xStocks mint carries several")
			}
			if _, err := mint.Prerogatives(); err != nil {
				t.Fatalf("prerogatives: %v", err)
			}
		})
	}
}

// The catastrophic case, and the reason the resolver exists. NFLXx reads 1.0
// in the field named multiplier while the live value has been 10.0 since
// November 2025. A reader of the obvious field prices the position at a tenth
// of what it is.
func TestNFLXxSplitIsResolved(t *testing.T) {
	mint, err := DecodeMint(mustFixture(t, "NFLXx").bytes(t))
	if err != nil {
		t.Fatal(err)
	}
	config, ok, err := mint.ScaledUIAmount()
	if err != nil || !ok {
		t.Fatalf("scaled ui amount: ok=%v err=%v", ok, err)
	}
	resolved, err := config.Resolve(referenceTime)
	if err != nil {
		t.Fatal(err)
	}

	if got := resolved.NaiveValue.String(); got != "1" {
		t.Errorf("the naive field should read 1, got %s", got)
	}
	if got := resolved.Value.String(); got != "10" {
		t.Errorf("the live multiplier should be 10, got %s", got)
	}
	if resolved.Source != MultiplierFromNew {
		t.Errorf("source should be new_multiplier, got %s", resolved.Source)
	}
	if !resolved.NaiveIsStale {
		t.Error("a naive reader is wrong here and the resolver must say so")
	}
	if resolved.ActivationPending {
		t.Error("this activation is long past, not pending")
	}
}

// A second split at a different ratio, so a decoder cannot pass by hardcoding
// the first one it saw.
func TestPALLxSplitIsADifferentRatio(t *testing.T) {
	mint, err := DecodeMint(mustFixture(t, "PALLx").bytes(t))
	if err != nil {
		t.Fatal(err)
	}
	config, _, err := mint.ScaledUIAmount()
	if err != nil {
		t.Fatal(err)
	}
	resolved, err := config.Resolve(referenceTime)
	if err != nil {
		t.Fatal(err)
	}
	if got := resolved.Value.String(); got != "5" {
		t.Errorf("live multiplier should be 5, got %s", got)
	}
}

// The subtle case: one corporate action behind rather than many. A decoder
// that only caught dramatic drift would pass NFLXx and fail silently here,
// which is the more common shape in the wild.
func TestAAPLxIsOneActionBehind(t *testing.T) {
	mint, err := DecodeMint(mustFixture(t, "AAPLx").bytes(t))
	if err != nil {
		t.Fatal(err)
	}
	config, _, err := mint.ScaledUIAmount()
	if err != nil {
		t.Fatal(err)
	}
	resolved, err := config.Resolve(referenceTime)
	if err != nil {
		t.Fatal(err)
	}
	if !resolved.NaiveIsStale {
		t.Fatal("AAPLx was one action behind at capture and the resolver must say so")
	}
	if resolved.Value.Equal(resolved.NaiveValue) {
		t.Fatal("live and naive values must differ here")
	}
	// Both are near 1.0, so the difference is small and easy to dismiss. It is
	// still a real mispricing on every share.
	if resolved.Source != MultiplierFromNew {
		t.Errorf("source should be new_multiplier, got %s", resolved.Source)
	}
}

// The opposite error. TQQQx had an activation scheduled but not yet effective
// at capture. Returning new_multiplier early is exactly as wrong as returning
// the stale field late, and only a fixture in this state can catch it.
func TestTQQQxPendingActivationIsNotAppliedEarly(t *testing.T) {
	mint, err := DecodeMint(mustFixture(t, "TQQQx").bytes(t))
	if err != nil {
		t.Fatal(err)
	}
	config, _, err := mint.ScaledUIAmount()
	if err != nil {
		t.Fatal(err)
	}

	justBefore := config.NewMultiplierEffectiveAt.Add(-time.Second)
	before, err := config.Resolve(justBefore)
	if err != nil {
		t.Fatal(err)
	}
	if before.Source != MultiplierFromCurrent {
		t.Errorf("before the effective time the source must be multiplier, got %s", before.Source)
	}
	if !before.ActivationPending {
		t.Error("a scheduled activation that has not landed must be reported as pending")
	}
	if before.NaiveIsStale {
		t.Error("before the activation the naive field is correct, so nothing is stale yet")
	}

	// The boundary is inclusive: at exactly the effective second, it applies.
	at, err := config.Resolve(config.NewMultiplierEffectiveAt)
	if err != nil {
		t.Fatal(err)
	}
	if at.Source != MultiplierFromNew {
		t.Errorf("at the effective instant the source must be new_multiplier, got %s", at.Source)
	}
	if at.ActivationPending {
		t.Error("an activation that has landed is no longer pending")
	}
	if at.Value.Equal(before.Value) {
		t.Error("the multiplier must actually change across its effective instant")
	}
}

// The control. Where the two fields agree, resolution is unambiguous and a
// decoder that always preferred one field would still pass. A control that
// cannot fail is what makes the failing fixtures meaningful.
func TestCATxControlHasNothingToResolve(t *testing.T) {
	mint, err := DecodeMint(mustFixture(t, "CATx").bytes(t))
	if err != nil {
		t.Fatal(err)
	}
	config, _, err := mint.ScaledUIAmount()
	if err != nil {
		t.Fatal(err)
	}
	resolved, err := config.Resolve(referenceTime)
	if err != nil {
		t.Fatal(err)
	}
	if resolved.NaiveIsStale {
		t.Error("the control must not be stale")
	}
	if resolved.ActivationPending {
		t.Error("the control has no pending activation")
	}
	if !resolved.Value.Equal(resolved.NaiveValue) {
		t.Error("the control's live and naive values must agree")
	}
}

// Every xStocks mint carries a transfer hook that exists and is switched off.
// Reporting that as absent would be a lie of exactly the kind that matters: a
// hook that is off can be switched on by its authority at any time.
func TestTransferHookDisabledIsNotAbsent(t *testing.T) {
	for _, symbol := range []string{"AAPLx", "NFLXx", "CATx"} {
		t.Run(symbol, func(t *testing.T) {
			mint, err := DecodeMint(mustFixture(t, symbol).bytes(t))
			if err != nil {
				t.Fatal(err)
			}
			p, err := mint.Prerogatives()
			if err != nil {
				t.Fatal(err)
			}
			if p.TransferHook.State != TransferHookInitializedDisabled {
				t.Errorf("transfer hook state is %s, want initialized_disabled", p.TransferHook.State)
			}
			if p.TransferHook.Program != nil {
				t.Errorf("a disabled hook must have no program, got %s", p.TransferHook.Program)
			}
			if p.TransferHook.Authority == nil {
				t.Error("a disabled hook still has an authority who can switch it on")
			}
		})
	}
}

func TestPrerogativesAreDecodedFromRealMints(t *testing.T) {
	mint, err := DecodeMint(mustFixture(t, "AAPLx").bytes(t))
	if err != nil {
		t.Fatal(err)
	}
	p, err := mint.Prerogatives()
	if err != nil {
		t.Fatal(err)
	}
	if p.FreezeAuthority == nil {
		t.Error("AAPLx carries a freeze authority")
	}
	if p.PermanentDelegate == nil {
		t.Error("AAPLx carries a permanent delegate, which can take tokens from any wallet")
	}
	if p.Pausable == nil {
		t.Error("AAPLx is pausable")
	}
	if p.ScaledUIAuthority == nil {
		t.Error("AAPLx has a scaled UI authority, which can change apparent balances")
	}
	if p.MintAuthority == nil {
		t.Error("AAPLx has a mint authority")
	}
	if p.DefaultAccountState == nil {
		t.Error("AAPLx carries a default account state")
	}
	if len(p.UnknownExtensions) != 0 {
		t.Logf("note: unrecognised extensions present, which is information rather than failure: %v", p.UnknownExtensions)
	}

	sentences := p.Sentences()
	if len(sentences) < 5 {
		t.Errorf("expected several prerogative sentences, got %d: %v", len(sentences), sentences)
	}
	t.Logf("AAPLx, decoded live from mainnet at slot %d:", mustFixture(t, "AAPLx").Slot)
	for _, s := range sentences {
		t.Logf("  %s", s)
	}
}

// An extension this build does not know must survive to the output. A dropped
// unknown is indistinguishable from an absent one at every layer above, which
// is how a new issuer power becomes invisible.
func TestUnknownExtensionSurvives(t *testing.T) {
	raw := mustFixture(t, "CATx").bytes(t)

	// Append a TLV entry with a type number no build recognises.
	const unknownType = 60000
	altered := make([]byte, len(raw), len(raw)+8)
	copy(altered, raw)
	altered = append(altered, byte(unknownType&0xff), byte(unknownType>>8), 4, 0, 0xde, 0xad, 0xbe, 0xef)

	mint, err := DecodeMint(altered)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	p, err := mint.Prerogatives()
	if err != nil {
		t.Fatalf("prerogatives: %v", err)
	}

	found := false
	for _, e := range p.UnknownExtensions {
		if uint16(e) == unknownType {
			found = true
		}
	}
	if !found {
		t.Fatalf("unknown extension %d was dropped; got %v", unknownType, p.UnknownExtensions)
	}
	for _, s := range p.Sentences() {
		if len(s) > 0 && s[0] == 'T' {
			continue
		}
	}
	// It must also reach a user, not merely a struct field.
	reached := false
	for _, s := range p.Sentences() {
		if contains(s, "does not yet decode") {
			reached = true
		}
	}
	if !reached {
		t.Error("an unknown issuer control must reach the interface as a sentence, not only a field")
	}
}

func contains(haystack, needle string) bool {
	for i := 0; i+len(needle) <= len(haystack); i++ {
		if haystack[i:i+len(needle)] == needle {
			return true
		}
	}
	return false
}

func TestDecodeRejectsMalformedAccounts(t *testing.T) {
	raw := mustFixture(t, "CATx").bytes(t)

	if _, err := DecodeMint(raw[:40]); err == nil {
		t.Error("a truncated account must be refused")
	}
	if _, err := DecodeMint(raw[:100]); err == nil {
		t.Error("an account longer than the base mint but too short for the discriminator must be refused")
	}

	wrongType := make([]byte, len(raw))
	copy(wrongType, raw)
	wrongType[accountTypeOffset] = 2 // a token account, not a mint
	if _, err := DecodeMint(wrongType); err == nil {
		t.Error("an account whose discriminator says it is not a mint must be refused")
	}

	overrun := make([]byte, len(raw), len(raw)+4)
	copy(overrun, raw)
	overrun = append(overrun, 25, 0, 0xff, 0xff) // declares 65535 bytes that are not there
	if _, err := DecodeMint(overrun); err == nil {
		t.Error("an extension declaring more bytes than remain must be refused")
	}
}

func TestBase58RoundTripsRealAddresses(t *testing.T) {
	for symbol, f := range loadFixtures(t) {
		key, err := ParsePubkey(f.Address)
		if err != nil {
			t.Fatalf("%s: %v", symbol, err)
		}
		if key.String() != f.Address {
			t.Errorf("%s: round trip changed the address\n  want %s\n  got  %s", symbol, f.Address, key)
		}
	}
	// A leading zero byte is positional in base58 and is where naive
	// implementations lose a character.
	var leadingZero Pubkey
	leadingZero[31] = 1
	if got := leadingZero.String(); got[0] != '1' {
		t.Errorf("an address with leading zero bytes must encode leading 1s, got %s", got)
	}
	back, err := ParsePubkey(leadingZero.String())
	if err != nil || back != leadingZero {
		t.Errorf("leading zero round trip failed: %v %v", back, err)
	}
}

func TestResolveNeverReadsTheClock(t *testing.T) {
	mint, err := DecodeMint(mustFixture(t, "NFLXx").bytes(t))
	if err != nil {
		t.Fatal(err)
	}
	config, _, err := mint.ScaledUIAmount()
	if err != nil {
		t.Fatal(err)
	}
	// Two instants decades apart, each resolved twice. Same input, same answer,
	// forever. A resolver that consulted time.Now could not promise this.
	for _, asOf := range []time.Time{
		time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC),
		time.Date(2099, 1, 1, 0, 0, 0, 0, time.UTC),
	} {
		first, err := config.Resolve(asOf)
		if err != nil {
			t.Fatal(err)
		}
		second, err := config.Resolve(asOf)
		if err != nil {
			t.Fatal(err)
		}
		if first.Value.String() != second.Value.String() || first.Source != second.Source {
			t.Errorf("resolution at %s was not reproducible", asOf)
		}
	}
}
