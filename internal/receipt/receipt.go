// Package receipt builds the artifact that outlives the session.
//
// A receipt has two bodies. The public one is what anyone may see and is what
// the seal commits to. The private one holds the full record and stays with its
// owner. They are built separately, from the same event, rather than one being
// filtered from the other.
//
// That separation is not stylistic. Filtering invites the question "did we
// remember to remove everything," and the answer only has to be no once.
// Building separately means the public body can only contain fields someone
// deliberately put in it, and the test in this package scans every public
// artifact to confirm that nothing sensitive arrived by another route.
//
// Two rules come from a correction recorded in
// docs/decisions/2026-09-22-reconciliation.md, decision D7, and both are easy
// to get wrong in the obvious direction:
//
// A transaction signature is not redactable. It is public on chain and reveals
// the wallet and every amount, so a public artifact containing one is not
// redacted whatever else it omits.
//
// Hashing private data without a salt leaks it. Trade amounts occupy a small
// space, so an unsalted digest of one can be recovered by hashing candidates
// until they match. The private body carries 32 random bytes.
package receipt

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/BeyndtechArc/Seametry/internal/canonical"
	"github.com/BeyndtechArc/Seametry/internal/merkle"
)

// SaltLength is the size of the private body's salt, in bytes.
const SaltLength = 32

// Kind describes what the receipt records.
type Kind string

const (
	KindStrike     Kind = "strike"
	KindMelt       Kind = "melt"
	KindWithdraw   Kind = "withdraw"
	KindAllocation Kind = "allocation_purchase"
)

// SizeBand is a coarse bucket that stands in for an exact amount in public.
//
// It exists because an exact amount, combined with a public chain, identifies
// a transaction and therefore a wallet. A band still lets a reader judge
// whether a receipt is material without handing them a lookup key.
type SizeBand string

const (
	BandUnder100    SizeBand = "under 100 USDC"
	Band100To1000   SizeBand = "100 to 1,000 USDC"
	Band1000To10000 SizeBand = "1,000 to 10,000 USDC"
	BandOver10000   SizeBand = "over 10,000 USDC"
)

// Constituent is one instrument inside a receipt, with the facts that make it
// what it is rather than what it is worth.
type Constituent struct {
	Ticker string `json:"ticker"`
	Mint   string `json:"mint"`
	Grade  string `json:"grade"`
	// IssuerCan lists the issuer's powers as plain sentences, exactly as the
	// registry decoded them at signing time. A receipt records what was known
	// then, not what is true now.
	IssuerCan []string `json:"issuer_can"`
}

// PublicBody is the artifact anyone may see and the thing the seal commits to.
//
// Every field here is deliberate. Adding one is a decision about what the world
// may know about a holder, so the struct is the place that decision is made and
// the scan test is the place it is enforced.
type PublicBody struct {
	Serial          string        `json:"serial"`
	Kind            Kind          `json:"kind"`
	Month           string        `json:"month"`
	Basket          string        `json:"basket"`
	Constituents    []Constituent `json:"constituents"`
	WeakestEvidence string        `json:"weakest_evidence"`
	SizeBand        SizeBand      `json:"size_band"`
	Venues          []string      `json:"venues"`
	PolicyVersion   string        `json:"policy_version"`
	Settlement      string        `json:"settlement"`
	Office          string        `json:"office"`
}

// PrivateBody is the full record. It never leaves its owner, and the seal
// commits only to its digest.
type PrivateBody struct {
	Serial string `json:"serial"`

	Wallet    string `json:"wallet"`
	Signature string `json:"signature"`

	// Amounts travel as integer atoms plus scale, like every other amount.
	ApprovedAtoms string `json:"approved_atoms"`
	SettledAtoms  string `json:"settled_atoms"`
	FloorAtoms    string `json:"floor_atoms"`
	Scale         int32  `json:"scale"`

	FeeAtoms   string    `json:"fee_atoms"`
	ApprovedAt time.Time `json:"approved_at"`
	SettledAt  time.Time `json:"settled_at"`
	Slot       uint64    `json:"slot"`

	// ApprovalDigest binds the inputs the user approved. Any material change
	// to them invalidates the approval, and recording it here is what lets an
	// owner prove afterwards what they agreed to.
	ApprovalDigest string `json:"approval_digest"`

	// Salt is 32 cryptographically random bytes, hex encoded. Without it the
	// digest of this body could be recovered by hashing candidate amounts.
	Salt string `json:"salt"`
}

// Receipt pairs the two bodies before sealing.
type Receipt struct {
	Serial  Serial
	Public  PublicBody
	Private PrivateBody
}

// NewSalt generates a salt. It fails rather than proceeding with a weak one,
// because a predictable salt is the same as no salt.
func NewSalt() (string, error) {
	raw := make([]byte, SaltLength)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("receipt: generating salt: %w", err)
	}
	return hex.EncodeToString(raw), nil
}

// Leaf computes this receipt's Merkle leaf:
//
//	leaf = SHA-256( 0x00 || H(public_body) || H(private_body_with_salt) )
//
// It refuses a private body with no salt. That check is here rather than at
// the call site because an unsalted leaf is indistinguishable from a salted
// one by inspection, so it has to be impossible to construct rather than
// merely discouraged.
func (r Receipt) Leaf() (merkle.Hash, error) {
	if len(r.Private.Salt) != SaltLength*2 {
		return merkle.Hash{}, fmt.Errorf(
			"receipt %s: private body salt is %d hex characters, want %d; "+
				"an unsalted body can be recovered by hashing candidate amounts",
			r.Serial, len(r.Private.Salt), SaltLength*2)
	}
	if r.Public.Serial != string(r.Serial) || r.Private.Serial != string(r.Serial) {
		return merkle.Hash{}, fmt.Errorf(
			"receipt %s: the two bodies disagree about which receipt they are (public %q, private %q)",
			r.Serial, r.Public.Serial, r.Private.Serial)
	}

	publicDigest, err := canonical.Digest(r.Public)
	if err != nil {
		return merkle.Hash{}, fmt.Errorf("receipt %s: public body: %w", r.Serial, err)
	}
	privateDigest, err := canonical.Digest(r.Private)
	if err != nil {
		return merkle.Hash{}, fmt.Errorf("receipt %s: private body: %w", r.Serial, err)
	}
	return merkle.LeafHash(publicDigest, privateDigest), nil
}

// PrivateCommitment is the digest of the private body, which travels with a
// proof so that a verifier can recompute the leaf without seeing the body.
func (r Receipt) PrivateCommitment() (merkle.Hash, error) {
	return canonical.Digest(r.Private)
}

// Batch is a set of receipts sealed together.
type Batch struct {
	Receipts []Receipt
	leaves   []merkle.Hash
}

// NewBatch computes every leaf up front, so a malformed receipt is refused
// before anything is sealed rather than after.
func NewBatch(receipts []Receipt) (*Batch, error) {
	leaves := make([]merkle.Hash, len(receipts))
	seen := make(map[Serial]struct{}, len(receipts))
	for i, r := range receipts {
		if _, duplicate := seen[r.Serial]; duplicate {
			return nil, fmt.Errorf("receipt: serial %s appears twice in one batch; serials are never reused", r.Serial)
		}
		seen[r.Serial] = struct{}{}

		leaf, err := r.Leaf()
		if err != nil {
			return nil, err
		}
		leaves[i] = leaf
	}
	return &Batch{Receipts: receipts, leaves: leaves}, nil
}

// Root is the value written on chain.
func (b *Batch) Root() merkle.Hash { return merkle.Root(b.leaves) }

// Proof returns everything a verifier needs for one receipt, and nothing more.
func (b *Batch) Proof(serial Serial) (*Proof, error) {
	for i, r := range b.Receipts {
		if r.Serial != serial {
			continue
		}
		path, err := merkle.InclusionProof(b.leaves, i)
		if err != nil {
			return nil, err
		}
		commitment, err := r.PrivateCommitment()
		if err != nil {
			return nil, err
		}
		return &Proof{
			Serial:            serial,
			Public:            r.Public,
			PrivateCommitment: commitment.String(),
			Path:              path,
			Root:              b.Root().String(),
		}, nil
	}
	return nil, fmt.Errorf("receipt: serial %s is not in this batch", serial)
}

// Proof is the public verification package. It deliberately carries the
// private body's digest and not the body, so that a verifier can recompute the
// leaf while learning nothing about the amounts.
type Proof struct {
	Serial            Serial             `json:"serial"`
	Public            PublicBody         `json:"public_body"`
	PrivateCommitment string             `json:"private_commitment"`
	Path              []merkle.ProofStep `json:"path"`
	Root              string             `json:"root"`
}

// Verify recomputes the root from the proof and reports whether it matches.
//
// It takes no Seametry state and no credentials. That is the point: anyone
// holding this struct can check it, including in a browser, and the Explorer
// does exactly this in front of the visitor.
func (p *Proof) Verify() (bool, error) {
	publicDigest, err := canonical.Digest(p.Public)
	if err != nil {
		return false, fmt.Errorf("receipt: public body: %w", err)
	}
	commitment, err := merkle.ParseHash(p.PrivateCommitment)
	if err != nil {
		return false, fmt.Errorf("receipt: private commitment: %w", err)
	}
	leaf := merkle.LeafHash(publicDigest, commitment)

	computed, err := merkle.RootFromProof(leaf, p.Path)
	if err != nil {
		return false, err
	}
	return computed.String() == p.Root, nil
}

// VerifyPrivate checks a revealed private body against the commitment in a
// proof. Only the owner can run this, because only the owner has the body and
// its salt.
func (p *Proof) VerifyPrivate(body PrivateBody) (bool, error) {
	raw, err := canonical.Digest(body)
	if err != nil {
		return false, fmt.Errorf("receipt: private body: %w", err)
	}
	// canonical.Digest returns an unnamed [32]byte, which assigns to
	// merkle.Hash but carries none of its methods.
	digest := merkle.Hash(raw)
	return digest.String() == p.PrivateCommitment, nil
}
