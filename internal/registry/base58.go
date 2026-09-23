package registry

import (
	"fmt"
	"math/big"
)

// Solana's base58 alphabet omits 0, O, I and l, the characters people
// transcribe wrongly.
const base58Alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

var base58Index = func() map[byte]int {
	m := make(map[byte]int, len(base58Alphabet))
	for i := 0; i < len(base58Alphabet); i++ {
		m[base58Alphabet[i]] = i
	}
	return m
}()

// encodeBase58 renders bytes the way Solana addresses are written.
//
// Implemented here rather than taken as a dependency: it is thirty lines, it
// has no security surface beyond correctness, and the round trip test against
// real mainnet addresses is stronger evidence than a version pin.
func encodeBase58(input []byte) string {
	zeros := 0
	for zeros < len(input) && input[zeros] == 0 {
		zeros++
	}

	n := new(big.Int).SetBytes(input)
	radix := big.NewInt(58)
	remainder := new(big.Int)
	var out []byte
	for n.Sign() > 0 {
		n.DivMod(n, radix, remainder)
		out = append(out, base58Alphabet[remainder.Int64()])
	}
	// A leading zero byte carries no magnitude, so it has to be encoded
	// positionally or every address beginning with one would shorten.
	for i := 0; i < zeros; i++ {
		out = append(out, base58Alphabet[0])
	}
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	return string(out)
}

func decodeBase58(s string) ([]byte, error) {
	n := new(big.Int)
	radix := big.NewInt(58)
	for i := 0; i < len(s); i++ {
		digit, ok := base58Index[s[i]]
		if !ok {
			return nil, fmt.Errorf("registry: %q is not base58 (at position %d)", s, i)
		}
		n.Mul(n, radix)
		n.Add(n, big.NewInt(int64(digit)))
	}

	zeros := 0
	for zeros < len(s) && s[zeros] == base58Alphabet[0] {
		zeros++
	}
	body := n.Bytes()
	out := make([]byte, zeros+len(body))
	copy(out[zeros:], body)
	return out, nil
}
