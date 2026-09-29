package basket_test

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/BeyndtechArc/Seametry/server/internal/basket"
	"github.com/BeyndtechArc/Seametry/server/internal/registry"
)

// accountFixture mirrors server/cmd/capture's own Fixture shape, and
// shared/fixtures/hall-devnet's own files use it: one raw account capture,
// with its digest, the same convention shared/fixtures/mainnet already
// uses.
type accountFixture struct {
	Address    string `json:"address"`
	Slot       uint64 `json:"slot"`
	CapturedAt string `json:"captured_at"`
	Owner      string `json:"owner"`
	DataSHA256 string `json:"data_sha256"`
	DataBase64 string `json:"data_base64"`
}

func loadFixture(t *testing.T, name string) (accountFixture, []byte) {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "shared", "fixtures", "hall-devnet", name))
	if err != nil {
		t.Fatal(err)
	}
	var f accountFixture
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatal(err)
	}
	data, err := base64.StdEncoding.DecodeString(f.DataBase64)
	if err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(data)
	if got := hex.EncodeToString(sum[:]); got != f.DataSHA256 {
		t.Fatalf("%s: data_sha256 is %s, the stored bytes hash to %s; the fixture was altered since capture", name, f.DataSHA256, got)
	}
	return f, data
}

// TestDecodeAlloyReadsARealDevnetAccount is checked against
// shared/fixtures/hall-devnet/alloy.json, a real account read from Solana
// devnet (not synthesized): chain/tools/devnet-demo's own founding
// scenario, "initialize_alloy with 5,000,000 of A and 3,000,000 of B, and
// 1,000,000 genesis shares locked" (shared/evidence/hall-demo/
// transcript-devnet.json), which is exactly what this test asserts.
func TestDecodeAlloyReadsARealDevnetAccount(t *testing.T) {
	f, data := loadFixture(t, "alloy.json")
	address, err := registry.ParsePubkey(f.Address)
	if err != nil {
		t.Fatal(err)
	}

	alloy, err := basket.DecodeAlloy(address, data)
	if err != nil {
		t.Fatalf("DecodeAlloy: %v", err)
	}

	if alloy.Supply != 1_000_000 {
		t.Errorf("supply = %d, want 1,000,000 (the transcript's own genesis strike)", alloy.Supply)
	}
	if alloy.LockedGenesis != 1_000_000 {
		t.Errorf("locked_genesis = %d, want 1,000,000: the whole genesis strike is locked", alloy.LockedGenesis)
	}
	if alloy.ConstituentCount != 2 {
		t.Fatalf("constituent_count = %d, want 2", alloy.ConstituentCount)
	}
	if len(alloy.Legs) != 2 {
		t.Fatalf("decoded %d legs, want 2 (ConstituentCount, not MaxConstituents: the fixed-size array is trimmed to what is actually populated)", len(alloy.Legs))
	}
	if alloy.Legs[0].Ledger != 5_000_000 {
		t.Errorf("leg 0 ledger = %d, want 5,000,000 (the transcript's own 5,000,000 of A)", alloy.Legs[0].Ledger)
	}
	if alloy.Legs[1].Ledger != 3_000_000 {
		t.Errorf("leg 1 ledger = %d, want 3,000,000 (the transcript's own 3,000,000 of B)", alloy.Legs[1].Ledger)
	}
	for i, leg := range alloy.Legs {
		if leg.TokenProgram.String() != registry.Token2022ProgramID {
			t.Errorf("leg %d token_program = %s, want the real Token-2022 program id %s", i, leg.TokenProgram, registry.Token2022ProgramID)
		}
		if leg.HallAccount.IsZero() {
			t.Errorf("leg %d hall_account is the zero address", i)
		}
	}
}

func TestDecodeAlloyRefusesTheWrongLength(t *testing.T) {
	addr, _ := registry.ParsePubkey(registry.Token2022ProgramID)
	if _, err := basket.DecodeAlloy(addr, make([]byte, 100)); err == nil {
		t.Fatal("DecodeAlloy accepted 100 bytes, far short of a real Alloy account")
	}
}

func TestDecodeAlloyRefusesTheWrongDiscriminator(t *testing.T) {
	_, data := loadFixture(t, "alloy.json")
	altered := append([]byte{}, data...)
	altered[0] ^= 0xFF // corrupt the discriminator's first byte
	addr, _ := registry.ParsePubkey(registry.Token2022ProgramID)
	if _, err := basket.DecodeAlloy(addr, altered); err == nil {
		t.Fatal("DecodeAlloy accepted data whose discriminator does not name an Alloy account")
	}
}

// TestTokenAccountFrozenReadsRealAccounts is checked against both real
// devnet leg accounts this alloy actually owns: neither is frozen (the
// founding scenario never calls freeze), which is itself the fact under
// test, not an assumption about what "not frozen" looks like.
func TestTokenAccountFrozenReadsRealAccounts(t *testing.T) {
	for _, name := range []string{"leg-0-hall-account.json", "leg-1-hall-account.json"} {
		_, data := loadFixture(t, name)
		frozen, err := basket.TokenAccountFrozen(data)
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		if frozen {
			t.Errorf("%s: reports frozen, want not frozen: the founding scenario never freezes anything", name)
		}
	}
}

func TestTokenAccountFrozenRefusesShortData(t *testing.T) {
	if _, err := basket.TokenAccountFrozen(make([]byte, 10)); err == nil {
		t.Fatal("TokenAccountFrozen accepted 10 bytes, far short of a real token account")
	}
}
