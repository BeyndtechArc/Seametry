package merkle

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"testing"
)

// vectorFile mirrors spec/merkle/vectors.json, which binds this package, the
// browser side verifier in the Explorer, and the Rust program. It is never
// edited to make this test pass.
type vectorFile struct {
	Scheme    string `json:"scheme"`
	SplitRule string `json:"split_rule"`
	Trees     []struct {
		LeafCount int    `json:"leaf_count"`
		Root      string `json:"root"`
		Proofs    []struct {
			Index int         `json:"index"`
			Leaf  string      `json:"leaf"`
			Path  []ProofStep `json:"path"`
		} `json:"proofs"`
	} `json:"trees"`
}

func loadVectors(t *testing.T) vectorFile {
	t.Helper()
	path := filepath.Join("..", "..", "spec", "merkle", "vectors.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	var vf vectorFile
	if err := json.Unmarshal(raw, &vf); err != nil {
		t.Fatalf("parse %s: %v", path, err)
	}
	if len(vf.Trees) == 0 {
		t.Fatalf("%s is empty; run: node tools/spec/generate.mjs", path)
	}
	return vf
}

// syntheticLeaf reproduces the vector generator's leaf construction:
// leaf(i) = SHA-256(0x00 || SHA-256("public-i") || SHA-256("private-i"))
func syntheticLeaf(i int) Hash {
	return LeafHash(
		sha256.Sum256([]byte(fmt.Sprintf("public-%d", i))),
		sha256.Sum256([]byte(fmt.Sprintf("private-%d", i))),
	)
}

func syntheticLeaves(n int) []Hash {
	leaves := make([]Hash, n)
	for i := range leaves {
		leaves[i] = syntheticLeaf(i)
	}
	return leaves
}

// TestVectorRoots is the cross implementation binding: Go must produce the same
// root as the JavaScript generator for every tree size in the spec.
func TestVectorRoots(t *testing.T) {
	for _, tree := range loadVectors(t).Trees {
		t.Run(fmt.Sprintf("n=%d", tree.LeafCount), func(t *testing.T) {
			if got := Root(syntheticLeaves(tree.LeafCount)).String(); got != tree.Root {
				t.Errorf("root differs\n  want %s\n  got  %s", tree.Root, got)
			}
		})
	}
}

// TestVectorProofs checks both that we generate the spec's audit paths and that
// we recompute the spec's roots from them.
func TestVectorProofs(t *testing.T) {
	for _, tree := range loadVectors(t).Trees {
		leaves := syntheticLeaves(tree.LeafCount)
		for _, p := range tree.Proofs {
			t.Run(fmt.Sprintf("n=%d/i=%d", tree.LeafCount, p.Index), func(t *testing.T) {
				leaf, err := ParseHash(p.Leaf)
				if err != nil {
					t.Fatal(err)
				}
				if got := leaves[p.Index]; got != leaf {
					t.Fatalf("leaf differs\n  want %s\n  got  %s", p.Leaf, got)
				}

				got, err := InclusionProof(leaves, p.Index)
				if err != nil {
					t.Fatal(err)
				}
				if len(got) != len(p.Path) {
					t.Fatalf("path length %d, want %d", len(got), len(p.Path))
				}
				for i := range got {
					if got[i] != p.Path[i] {
						t.Errorf("step %d differs\n  want %+v\n  got  %+v", i, p.Path[i], got[i])
					}
				}

				root, err := RootFromProof(leaf, p.Path)
				if err != nil {
					t.Fatal(err)
				}
				if root.String() != tree.Root {
					t.Errorf("recomputed root differs\n  want %s\n  got  %s", tree.Root, root)
				}
			})
		}
	}
}

// The mock this replaces threw on any count that was not a power of two. Every
// count must build and every leaf in it must prove.
func TestEveryLeafCountBuildsAndProves(t *testing.T) {
	for n := 1; n <= 64; n++ {
		leaves := syntheticLeaves(n)
		root := Root(leaves)
		for i := 0; i < n; i++ {
			proof, err := InclusionProof(leaves, i)
			if err != nil {
				t.Fatalf("n=%d i=%d: %v", n, i, err)
			}
			if maxLen := int(math.Ceil(math.Log2(float64(n)))); len(proof) > maxLen {
				t.Errorf("n=%d i=%d: path length %d exceeds ceil(log2(n))=%d", n, i, len(proof), maxLen)
			}
			got, err := RootFromProof(leaves[i], proof)
			if err != nil {
				t.Fatalf("n=%d i=%d: %v", n, i, err)
			}
			if got != root {
				t.Errorf("n=%d i=%d: recomputed root %s, want %s", n, i, got, root)
			}
		}
	}
}

// CVE-2012-2459. If an n-leaf tree could collide with the n+1-leaf tree formed
// by duplicating its final leaf, two different sets of receipts would be
// indistinguishable at the root, and the seal would prove nothing about which
// set was sealed.
func TestNoDuplicateNodeCollision(t *testing.T) {
	for n := 2; n <= 33; n++ {
		leaves := syntheticLeaves(n)
		duplicated := append(append([]Hash{}, leaves...), leaves[n-1])
		if Root(leaves) == Root(duplicated) {
			t.Errorf("n=%d collided with its duplicate-final-leaf extension", n)
		}
	}
}

func TestTamperedLeafDoesNotVerify(t *testing.T) {
	leaves := syntheticLeaves(8)
	root := Root(leaves)
	proof, err := InclusionProof(leaves, 3)
	if err != nil {
		t.Fatal(err)
	}
	tampered := LeafHash(
		sha256.Sum256([]byte("public-3-tampered")),
		sha256.Sum256([]byte("private-3")),
	)
	got, err := RootFromProof(tampered, proof)
	if err != nil {
		t.Fatal(err)
	}
	if got == root {
		t.Fatal("a tampered leaf reproduced the published root")
	}
}

// Domain separation: a leaf must never be constructible as an interior node of
// the same inputs, or an interior hash could be presented as a receipt.
func TestLeafAndNodeDomainsAreSeparate(t *testing.T) {
	a := sha256.Sum256([]byte("A"))
	b := sha256.Sum256([]byte("B"))
	if LeafHash(a, b) == NodeHash(a, b) {
		t.Fatal("leaf and interior hashes collide for identical inputs")
	}
}

// Leaf composition is order sensitive, so a public body can never be swapped
// with a private one and still verify.
func TestLeafCompositionIsOrderSensitive(t *testing.T) {
	a := sha256.Sum256([]byte("A"))
	b := sha256.Sum256([]byte("B"))
	if LeafHash(a, b) == LeafHash(b, a) {
		t.Fatal("leaf composition is order insensitive")
	}
}

func TestEmptyTreeIsHashOfEmptyString(t *testing.T) {
	if Root(nil) != sha256.Sum256(nil) {
		t.Fatal("an empty tree must be SHA-256 of the empty string, per RFC 6962")
	}
}

func TestSingleLeafTreeIsThatLeaf(t *testing.T) {
	leaf := syntheticLeaf(0)
	if Root([]Hash{leaf}) != leaf {
		t.Fatal("a single leaf tree must be that leaf; the 0x00 prefix is applied at leaf construction")
	}
}

func TestSplitPoint(t *testing.T) {
	for _, c := range []struct{ n, want int }{
		{2, 1}, {3, 2}, {4, 2}, {5, 4}, {7, 4}, {8, 4}, {9, 8}, {16, 8}, {17, 16},
	} {
		if got := splitPoint(c.n); got != c.want {
			t.Errorf("splitPoint(%d) = %d, want %d", c.n, got, c.want)
		}
	}
}

func TestProofWithUnknownSideIsRefused(t *testing.T) {
	leaf := syntheticLeaf(0)
	_, err := RootFromProof(leaf, []ProofStep{{Side: "sideways", Hash: leaf.String()}})
	if err == nil {
		t.Fatal("a proof step with an unknown side was accepted")
	}
}

func TestProofWithMalformedHashIsRefused(t *testing.T) {
	leaf := syntheticLeaf(0)
	for _, bad := range []string{"", "zz", "abcd"} {
		if _, err := RootFromProof(leaf, []ProofStep{{Side: SideLeft, Hash: bad}}); err == nil {
			t.Errorf("a proof step with hash %q was accepted", bad)
		}
	}
}

// buildProof appends to slices returned by recursive calls. If that ever shares
// backing arrays across sibling calls, proofs would corrupt each other, so
// generate them all up front and verify them afterward rather than one at a time.
func TestProofsDoNotAliasEachOther(t *testing.T) {
	const n = 16
	leaves := syntheticLeaves(n)
	root := Root(leaves)

	proofs := make([][]ProofStep, n)
	for i := range proofs {
		p, err := InclusionProof(leaves, i)
		if err != nil {
			t.Fatal(err)
		}
		proofs[i] = p
	}
	for i, p := range proofs {
		got, err := RootFromProof(leaves[i], p)
		if err != nil {
			t.Fatal(err)
		}
		if got != root {
			t.Errorf("proof %d stopped verifying once the others existed: %s, want %s", i, got, root)
		}
	}
}
