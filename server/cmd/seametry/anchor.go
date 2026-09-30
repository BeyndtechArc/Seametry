package main

import (
	"context"
	"crypto/ed25519"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/BeyndtechArc/Seametry/server/internal/base58"
	"github.com/BeyndtechArc/Seametry/server/internal/receipt"
	"github.com/BeyndtechArc/Seametry/server/internal/solana"
	"github.com/BeyndtechArc/Seametry/server/internal/store"
)

// devnetGenesisHash identifies devnet by its first block. It was written from
// memory, not read from a node: this repository's build sandbox cannot reach
// devnet. If it is wrong the command refuses every endpoint and prints the
// hash the node reported, so it fails closed; confirm it once with
// `solana genesis-hash --url devnet`.
const devnetGenesisHash = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG"

// anchorChain is what anchoring needs of a cluster. *solana.Client is one.
type anchorChain interface {
	GetGenesisHash(ctx context.Context) (string, error)
	GetLatestBlockhash(ctx context.Context) ([32]byte, error)
	SendTransaction(ctx context.Context, tx solana.SignedTransaction) (string, error)
	GetSignatureStatus(ctx context.Context, signature string) (*solana.SignatureStatus, error)
}

// anchorLedger is what anchoring needs of the receipt ledger.
type anchorLedger interface {
	RegisterAnchorKey(ctx context.Context, key string, at time.Time) error
	Unanchored(ctx context.Context) ([]string, error)
	RecordAnchor(ctx context.Context, root string, a receipt.Anchor) error
}

type anchorRun struct {
	chain       anchorChain
	ledger      anchorLedger
	key         ed25519.PrivateKey
	evidenceDir string
	now         func() time.Time
	sleep       func(context.Context, time.Duration) error
	pollEvery   time.Duration
	// finalizeWithin bounds the wait for one transaction. Devnet finalizes in
	// well under a minute; past this the run stops rather than hang.
	finalizeWithin time.Duration
}

// anchorEvidence is what a stranger needs to find and check one anchor
// without Seametry: the transaction, the key that signed it, and the memo
// it must carry.
type anchorEvidence struct {
	Root        string    `json:"root"`
	Memo        string    `json:"memo"`
	Cluster     string    `json:"cluster"`
	Transaction string    `json:"transaction"`
	Key         string    `json:"key"`
	Slot        uint64    `json:"slot"`
	Commitment  string    `json:"commitment"`
	AnchoredAt  time.Time `json:"anchored_at"`
}

// anchor writes every sealed, unanchored batch root to devnet as a memo
// signed by the key in SEAMETRY_ANCHOR_KEYPAIR (a Solana CLI keypair file),
// records it in the ledger, and writes shared/evidence/anchors/<root>.json.
//
// The evidence file is written before the ledger row. If the process dies
// between the two, the file names the transaction already on chain; running
// again would write a second memo for the same root, which the ledger then
// records, and the first stays findable from the file.
func anchor(root string) error {
	dsn := os.Getenv("SEAMETRY_DATABASE_URL")
	if dsn == "" {
		return errors.New("SEAMETRY_DATABASE_URL is not set; anchor reads sealed batches from the receipt ledger")
	}
	keyPath := os.Getenv("SEAMETRY_ANCHOR_KEYPAIR")
	if keyPath == "" {
		return errors.New("SEAMETRY_ANCHOR_KEYPAIR is not set; point it at the memo-only key's Solana CLI keypair file (solana-keygen new -o anchor.json)")
	}
	key, err := loadKeypair(keyPath)
	if err != nil {
		return err
	}
	endpoint := strings.TrimSpace(os.Getenv("SEAMETRY_ANCHOR_RPC_URL"))
	if endpoint == "" {
		endpoint = "https://api.devnet.solana.com"
	}
	chain, err := solana.New(endpoint, solana.Options{})
	if err != nil {
		return fmt.Errorf("configuring SEAMETRY_ANCHOR_RPC_URL: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	pool, err := store.OpenPool(ctx, dsn)
	if err != nil {
		return fmt.Errorf("opening SEAMETRY_DATABASE_URL: %w", err)
	}
	defer pool.Close()

	run := anchorRun{
		chain: chain, ledger: receipt.NewLedger(pool), key: key,
		evidenceDir: filepath.Join(root, "shared", "evidence", "anchors"),
		now:         time.Now, sleep: sleepContext,
		pollEvery: 2 * time.Second, finalizeWithin: 90 * time.Second,
	}
	anchored, err := run.anchorAll(ctx)
	slog.Info("seametry: anchor finished", "endpoint", solana.RedactEndpoint(endpoint), "anchored", anchored)
	return err
}

func (r anchorRun) anchorAll(ctx context.Context) (int, error) {
	genesis, err := r.chain.GetGenesisHash(ctx)
	if err != nil {
		return 0, fmt.Errorf("reading the endpoint's genesis hash: %w", err)
	}
	if genesis != devnetGenesisHash {
		return 0, fmt.Errorf("the endpoint's genesis hash is %s, not devnet's %s; anchoring is devnet only until mainnet anchoring is decided, so nothing was sent", genesis, devnetGenesisHash)
	}
	signer := base58.Encode(r.key.Public().(ed25519.PublicKey))
	if err := r.ledger.RegisterAnchorKey(ctx, signer, r.now()); err != nil {
		return 0, err
	}
	roots, err := r.ledger.Unanchored(ctx)
	if err != nil {
		return 0, err
	}
	for i, root := range roots {
		if err := r.anchorOne(ctx, signer, root); err != nil {
			return i, fmt.Errorf("anchoring %s: %w", root, err)
		}
	}
	return len(roots), nil
}

func (r anchorRun) anchorOne(ctx context.Context, signer, root string) error {
	blockhash, err := r.chain.GetLatestBlockhash(ctx)
	if err != nil {
		return err
	}
	memo := receipt.AnchorMemo(root)
	tx, err := solana.SignMemo(r.key, blockhash, memo)
	if err != nil {
		return err
	}
	signature, err := r.chain.SendTransaction(ctx, tx)
	if err != nil {
		return err
	}
	status, err := r.awaitFinalized(ctx, signature)
	if err != nil {
		return err
	}

	evidence := anchorEvidence{
		Root: root, Memo: string(memo), Cluster: "devnet", Transaction: signature, Key: signer,
		Slot: status.Slot, Commitment: status.ConfirmationStatus, AnchoredAt: r.now().UTC(),
	}
	if err := writeAnchorEvidence(r.evidenceDir, evidence); err != nil {
		return fmt.Errorf("transaction %s is on devnet but its evidence was not written: %w", signature, err)
	}
	err = r.ledger.RecordAnchor(ctx, root, receipt.Anchor{Cluster: "devnet", Transaction: signature, Key: signer, AnchoredAt: evidence.AnchoredAt})
	if err != nil {
		return fmt.Errorf("transaction %s is on devnet and in %s, but the ledger refused it: %w", signature, r.evidenceDir, err)
	}
	slog.Info("seametry: anchored", "root", root, "transaction", signature, "slot", status.Slot)
	return nil
}

// awaitFinalized waits for finalized, not confirmed: an anchor is a claim
// that the root was public at that slot, and only a finalized block cannot
// be rolled back out from under the claim.
func (r anchorRun) awaitFinalized(ctx context.Context, signature string) (*solana.SignatureStatus, error) {
	deadline := r.now().Add(r.finalizeWithin)
	for {
		status, err := r.chain.GetSignatureStatus(ctx, signature)
		if err != nil {
			return nil, err
		}
		if status != nil && len(status.Err) > 0 && string(status.Err) != "null" {
			return nil, fmt.Errorf("transaction %s failed on chain: %s", signature, status.Err)
		}
		if status != nil && status.ConfirmationStatus == "finalized" {
			return status, nil
		}
		if !r.now().Before(deadline) {
			return nil, fmt.Errorf("transaction %s was not finalized within %s; it may still land, so check it before running again", signature, r.finalizeWithin)
		}
		if err := r.sleep(ctx, r.pollEvery); err != nil {
			return nil, err
		}
	}
}

func writeAnchorEvidence(dir string, evidence anchorEvidence) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	text, err := json.MarshalIndent(evidence, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, evidence.Root+".json"), append(text, '\n'), 0o644)
}

// loadKeypair reads a Solana CLI keypair file: a JSON array of 64 bytes, the
// seed then the public key, which is also Go's ed25519 private key layout.
func loadKeypair(path string) (ed25519.PrivateKey, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading SEAMETRY_ANCHOR_KEYPAIR %s: %w", path, err)
	}
	var bytes []byte
	var numbers []int
	if err := json.Unmarshal(raw, &numbers); err != nil {
		return nil, fmt.Errorf("SEAMETRY_ANCHOR_KEYPAIR %s is not a Solana CLI keypair file (a JSON array of 64 numbers): %w", path, err)
	}
	if len(numbers) != ed25519.PrivateKeySize {
		return nil, fmt.Errorf("SEAMETRY_ANCHOR_KEYPAIR %s holds %d numbers, a keypair holds %d", path, len(numbers), ed25519.PrivateKeySize)
	}
	for i, n := range numbers {
		if n < 0 || n > 255 {
			return nil, fmt.Errorf("SEAMETRY_ANCHOR_KEYPAIR %s: entry %d is %d, not a byte", path, i, n)
		}
		bytes = append(bytes, byte(n))
	}
	key := ed25519.NewKeyFromSeed(bytes[:ed25519.SeedSize])
	if !key.Public().(ed25519.PublicKey).Equal(ed25519.PublicKey(bytes[ed25519.SeedSize:])) {
		return nil, fmt.Errorf("SEAMETRY_ANCHOR_KEYPAIR %s: its public half does not belong to its seed", path)
	}
	return key, nil
}

func sleepContext(ctx context.Context, d time.Duration) error {
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}
