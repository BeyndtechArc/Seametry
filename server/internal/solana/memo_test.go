package solana

import (
	"bytes"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/BeyndtechArc/Seametry/server/internal/base58"
)

type anchorVectors struct {
	MemoProgram string `json:"memo_program"`
	Cases       []struct {
		Name              string `json:"name"`
		SeedHex           string `json:"seed_hex"`
		Signer            string `json:"signer"`
		RecentBlockhash   string `json:"recent_blockhash"`
		Memo              string `json:"memo"`
		MessageBase64     string `json:"message_base64"`
		SignatureHex      string `json:"signature_hex"`
		TransactionBase64 string `json:"transaction_base64"`
	} `json:"cases"`
}

// TestSignMemoMatchesWeb3js holds the hand-built transaction to the bytes
// @solana/web3.js produced for the same key, blockhash and memo
// (shared/tools/spec/anchor-vector.mjs). A cluster accepts or rejects a
// transaction on these bytes alone, so matching a second implementation
// exactly is the test that it is well formed.
func TestSignMemoMatchesWeb3js(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "shared", "spec", "anchor", "vectors.json"))
	if err != nil {
		t.Fatal(err)
	}
	var vectors anchorVectors
	if err := json.Unmarshal(raw, &vectors); err != nil {
		t.Fatal(err)
	}
	if vectors.MemoProgram != MemoProgramID {
		t.Fatalf("the vector's memo program is %s, this package's is %s", vectors.MemoProgram, MemoProgramID)
	}
	if len(vectors.Cases) == 0 {
		t.Fatal("the vector file has no cases; a test over nothing proves nothing")
	}
	for _, c := range vectors.Cases {
		t.Run(c.Name, func(t *testing.T) {
			seed, err := hex.DecodeString(c.SeedHex)
			if err != nil {
				t.Fatal(err)
			}
			key := ed25519.NewKeyFromSeed(seed)
			if got := base58.Encode(key.Public().(ed25519.PublicKey)); got != c.Signer {
				t.Fatalf("the seed gives signer %s, the vector names %s", got, c.Signer)
			}
			blockhash, err := base58.Decode(c.RecentBlockhash)
			if err != nil || len(blockhash) != 32 {
				t.Fatalf("recent blockhash %s: %v", c.RecentBlockhash, err)
			}

			tx, err := SignMemo(key, [32]byte(blockhash), []byte(c.Memo))
			if err != nil {
				t.Fatal(err)
			}
			wantMessage, _ := base64.StdEncoding.DecodeString(c.MessageBase64)
			if !bytes.Equal(tx.Message, wantMessage) {
				t.Errorf("message differs from web3.js\n got %x\nwant %x", tx.Message, wantMessage)
			}
			if got := hex.EncodeToString(tx.Signature[:]); got != c.SignatureHex {
				t.Errorf("signature %s, web3.js signed %s", got, c.SignatureHex)
			}
			wantWire, _ := base64.StdEncoding.DecodeString(c.TransactionBase64)
			if !bytes.Equal(tx.Wire, wantWire) {
				t.Errorf("wire transaction differs from web3.js\n got %x\nwant %x", tx.Wire, wantWire)
			}
		})
	}
}

func TestCompactU16CrossesItsByteBoundaries(t *testing.T) {
	for n, want := range map[int][]byte{
		0: {0x00}, 127: {0x7f}, 128: {0x80, 0x01}, 16383: {0xff, 0x7f}, 16384: {0x80, 0x80, 0x01},
	} {
		if got := appendCompactU16(nil, n); !bytes.Equal(got, want) {
			t.Errorf("compact-u16 of %d = %x, want %x", n, got, want)
		}
	}
}

func TestSignMemoRefusesAKeyOfTheWrongSize(t *testing.T) {
	if _, err := SignMemo(ed25519.PrivateKey(make([]byte, 32)), [32]byte{}, []byte("x")); err == nil {
		t.Fatal("a 32 byte seed was accepted as a 64 byte signing key")
	}
}
