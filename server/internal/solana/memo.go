package solana

import (
	"crypto/ed25519"
	"fmt"

	"github.com/BeyndtechArc/Seametry/server/internal/base58"
)

// MemoProgramID is SPL Memo v2. It checks that every account an instruction
// lists has signed, so listing the signer binds the memo to that key at the
// program level, not only through the fee payer.
const MemoProgramID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"

var memoProgram = func() [32]byte {
	raw, err := base58.Decode(MemoProgramID)
	if err != nil || len(raw) != 32 {
		panic(fmt.Sprintf("solana: the Memo program id %s does not decode to 32 bytes", MemoProgramID))
	}
	return [32]byte(raw)
}()

// SignedTransaction is a transaction ready for sendTransaction.
type SignedTransaction struct {
	Message   []byte
	Signature [ed25519.SignatureSize]byte
	Wire      []byte
}

// ID is the signature in base58, which is how the cluster names a transaction.
func (t SignedTransaction) ID() string { return base58.Encode(t.Signature[:]) }

// SignMemo builds a legacy transaction with one Memo instruction, paid for
// and signed by signer, and signs it. It is built by hand rather than with a
// Solana SDK: the whole format is the few lines below, and
// shared/spec/anchor/vectors.json, produced by @solana/web3.js, pins every
// byte of it.
func SignMemo(signer ed25519.PrivateKey, recentBlockhash [32]byte, memo []byte) (SignedTransaction, error) {
	if len(signer) != ed25519.PrivateKeySize {
		return SignedTransaction{}, fmt.Errorf("solana: a signing key is %d bytes, got %d", ed25519.PrivateKeySize, len(signer))
	}
	payer := signer.Public().(ed25519.PublicKey)

	// Header: one signature; no read-only signed account; one read-only
	// unsigned account, the Memo program. The payer is always writable.
	message := []byte{1, 0, 1}
	message = appendCompactU16(message, 2)
	message = append(message, payer...)
	message = append(message, memoProgram[:]...)
	message = append(message, recentBlockhash[:]...)
	message = appendCompactU16(message, 1)
	message = append(message, 1) // program id index: the Memo program
	message = appendCompactU16(message, 1)
	message = append(message, 0) // its one account: the payer, as signer
	message = appendCompactU16(message, len(memo))
	message = append(message, memo...)

	tx := SignedTransaction{Message: message}
	copy(tx.Signature[:], ed25519.Sign(signer, message))
	tx.Wire = appendCompactU16(nil, 1)
	tx.Wire = append(tx.Wire, tx.Signature[:]...)
	tx.Wire = append(tx.Wire, message...)
	return tx, nil
}

// appendCompactU16 is Solana's shortvec: seven bits per byte, low first, the
// high bit set while more follow.
func appendCompactU16(out []byte, n int) []byte {
	for {
		b := byte(n & 0x7f)
		n >>= 7
		if n == 0 {
			return append(out, b)
		}
		out = append(out, b|0x80)
	}
}
