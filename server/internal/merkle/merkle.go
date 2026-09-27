// Package merkle implements the receipt tree: how a receipt's public and
// private bodies combine into a leaf, how leaves combine into a root, and how
// anyone recomputes that root from a leaf and an audit path holding no
// Seametry credentials.
//
// The geometry is RFC 6962's. Two properties matter and neither is incidental:
//
// Domain separation. A leaf is prefixed 0x00 and an interior node 0x01, so no
// interior node can ever be presented as a leaf. Without it, an attacker who
// controls leaf content can claim an interior hash is a receipt.
//
// No duplicated final node. The pairwise fold that suggests itself first is
// undefined for counts that are not powers of two, and the obvious repair,
// duplicating the last node, is CVE-2012-2459: it makes an n-leaf tree produce
// the same root as the n+1-leaf tree built by duplicating its final leaf, so
// two different sets of receipts become indistinguishable at the root. RFC 6962
// splits at the largest power of two strictly below the count, which is defined
// for every count and admits no such collision.
//
// Bound by spec/merkle/vectors.json.
package merkle

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
)

// Hash is a SHA-256 digest.
type Hash [sha256.Size]byte

func (h Hash) String() string { return hex.EncodeToString(h[:]) }

// ParseHash reads a hex encoded digest.
func ParseHash(s string) (Hash, error) {
	var h Hash
	b, err := hex.DecodeString(s)
	if err != nil {
		return h, fmt.Errorf("merkle: %w", err)
	}
	if len(b) != sha256.Size {
		return h, fmt.Errorf("merkle: digest is %d bytes, want %d", len(b), sha256.Size)
	}
	copy(h[:], b)
	return h, nil
}

// Side says which operand the sibling in an audit path occupies.
type Side string

const (
	SideLeft  Side = "left"
	SideRight Side = "right"
)

// ProofStep is one sibling on the path from a leaf to the root.
type ProofStep struct {
	Side Side   `json:"side"`
	Hash string `json:"hash"`
}

const (
	leafPrefix = 0x00
	nodePrefix = 0x01
)

// LeafHash composes a receipt's leaf from the digests of its two bodies:
//
//	leaf = SHA-256( 0x00 || H(public_body) || H(private_body_with_salt) )
//
// The two bodies are constructed separately rather than one being filtered
// from the other, and the private body carries a random salt. Composition is
// order sensitive: the public digest always comes first.
func LeafHash(public, private Hash) Hash {
	var buf [1 + 2*sha256.Size]byte
	buf[0] = leafPrefix
	copy(buf[1:], public[:])
	copy(buf[1+sha256.Size:], private[:])
	return sha256.Sum256(buf[:])
}

// NodeHash combines two subtree roots:
//
//	interior = SHA-256( 0x01 || left || right )
func NodeHash(left, right Hash) Hash {
	var buf [1 + 2*sha256.Size]byte
	buf[0] = nodePrefix
	copy(buf[1:], left[:])
	copy(buf[1+sha256.Size:], right[:])
	return sha256.Sum256(buf[:])
}

// splitPoint is the largest power of two strictly less than n, for n >= 2.
func splitPoint(n int) int {
	k := 1
	for k*2 < n {
		k *= 2
	}
	return k
}

// Root returns the Merkle tree hash over leaves that are already domain
// separated by LeafHash.
//
// An empty tree is SHA-256 of the empty string, per RFC 6962. A single leaf
// tree is that leaf, because the 0x00 prefix was applied at leaf construction.
func Root(leaves []Hash) Hash {
	switch len(leaves) {
	case 0:
		return sha256.Sum256(nil)
	case 1:
		return leaves[0]
	}
	k := splitPoint(len(leaves))
	return NodeHash(Root(leaves[:k]), Root(leaves[k:]))
}

// InclusionProof returns the audit path for a leaf, ordered from the leaf
// upward. Its length never exceeds ceil(log2(n)).
func InclusionProof(leaves []Hash, index int) ([]ProofStep, error) {
	if index < 0 || index >= len(leaves) {
		return nil, fmt.Errorf("merkle: index %d out of range for %d leaves", index, len(leaves))
	}
	return buildProof(leaves, index), nil
}

func buildProof(leaves []Hash, index int) []ProofStep {
	if len(leaves) == 1 {
		return nil
	}
	k := splitPoint(len(leaves))
	if index < k {
		return append(
			buildProof(leaves[:k], index),
			ProofStep{Side: SideRight, Hash: Root(leaves[k:]).String()},
		)
	}
	return append(
		buildProof(leaves[k:], index-k),
		ProofStep{Side: SideLeft, Hash: Root(leaves[:k]).String()},
	)
}

// RootFromProof recomputes a root from a leaf and its audit path. This is the
// whole of what a verifier does, and it requires nothing from Seametry: the
// leaf, the path, and the published root are sufficient.
func RootFromProof(leaf Hash, proof []ProofStep) (Hash, error) {
	current := leaf
	for i, step := range proof {
		sibling, err := ParseHash(step.Hash)
		if err != nil {
			return Hash{}, fmt.Errorf("merkle: proof step %d: %w", i, err)
		}
		switch step.Side {
		case SideLeft:
			current = NodeHash(sibling, current)
		case SideRight:
			current = NodeHash(current, sibling)
		default:
			return Hash{}, fmt.Errorf("merkle: proof step %d: unknown side %q", i, step.Side)
		}
	}
	return current, nil
}
