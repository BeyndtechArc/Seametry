package receipt

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/BeyndtechArc/Seametry/server/internal/canonical"
	"github.com/BeyndtechArc/Seametry/server/internal/merkle"
	"github.com/BeyndtechArc/Seametry/server/internal/store/receiptdb"
)

// Ledger is Receipt and Audit's persistence (docs/prd/API.md section 12,
// step A4): serials allocated under a unique constraint, the public side of
// every issued receipt, sealed batches, and the anchors that put a batch
// root on chain. The private body never reaches it; only its digest does.
type Ledger struct {
	db beginner
	q  *receiptdb.Queries
}

// beginner is what a Ledger needs of its database: queries, and a
// transaction for the writes that must land together. *pgxpool.Pool is one.
type beginner interface {
	receiptdb.DBTX
	Begin(ctx context.Context) (pgx.Tx, error)
}

func NewLedger(db beginner) *Ledger {
	return &Ledger{db: db, q: receiptdb.New(db)}
}

// ErrNotIssued, ErrNotSealed and ErrNothingToSeal are the ledger's answers
// that are not failures: a serial nobody issued, a receipt waiting for its
// batch, and a seal with nothing waiting.
var (
	ErrNotIssued     = errors.New("receipt: no receipt carries this serial")
	ErrNotSealed     = errors.New("receipt: this receipt is issued but not yet sealed into a batch")
	ErrNothingToSeal = errors.New("receipt: every issued receipt is already sealed")
)

// AllocateSerial issues the next serial for the month containing when. The
// month's counter row is advanced and the serial written in one transaction:
// the row lock queues concurrent callers, and a failure rolls the counter
// back, so serials are never reused and never skipped.
func (l *Ledger) AllocateSerial(ctx context.Context, when time.Time) (serial Serial, err error) {
	period := periodOf(when)
	tx, err := l.db.Begin(ctx)
	if err != nil {
		return "", fmt.Errorf("receipt: opening the allocation transaction: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback(ctx)
		}
	}()
	q := l.q.WithTx(tx)
	sequence, err := q.NextSequence(ctx, period)
	if err != nil {
		return "", fmt.Errorf("receipt: advancing the counter for %s: %w", period, err)
	}
	if serial, err = FormatSerial(when, uint64(sequence)); err != nil {
		return "", err
	}
	err = q.AllocateSerial(ctx, receiptdb.AllocateSerialParams{
		Period: period, Sequence: sequence, Serial: string(serial), AllocatedAt: timestamptz(when),
	})
	if err != nil {
		return "", fmt.Errorf("receipt: allocating %s: %w", serial, err)
	}
	if err = tx.Commit(ctx); err != nil {
		return "", fmt.Errorf("receipt: committing %s: %w", serial, err)
	}
	return serial, nil
}

// Issue records a receipt whose serial this ledger allocated. The private
// body is used to compute the commitment and leaf and is then dropped.
func (l *Ledger) Issue(ctx context.Context, r Receipt, at time.Time) error {
	leaf, err := r.Leaf()
	if err != nil {
		return err
	}
	commitment, err := r.PrivateCommitment()
	if err != nil {
		return err
	}
	return insert(ctx, l.q, r.Public, merkle.Hash(commitment), leaf, at)
}

// RecordBatch stores a batch sealed before this ledger existed, from its
// published proofs in leaf order (shared/evidence/demo-batch). It refuses
// before writing anything unless the proofs reproduce the published root,
// and then writes serials, receipts and the batch in one transaction, so a
// published batch is never visible half recorded or with its receipts
// unsealed. Recording the same batch twice changes nothing.
func (l *Ledger) RecordBatch(ctx context.Context, root merkle.Hash, proofs []Proof, at time.Time) (err error) {
	leaves := make([]merkle.Hash, len(proofs))
	commitments := make([]merkle.Hash, len(proofs))
	for i, p := range proofs {
		if commitments[i], err = merkle.ParseHash(p.PrivateCommitment); err != nil {
			return fmt.Errorf("receipt %s: private commitment: %w", p.Serial, err)
		}
		publicDigest, err := canonical.Digest(p.Public)
		if err != nil {
			return fmt.Errorf("receipt %s: public body: %w", p.Serial, err)
		}
		leaves[i] = merkle.LeafHash(publicDigest, commitments[i])
	}
	if computed := merkle.Root(leaves); computed != root {
		return fmt.Errorf("receipt: %d published proofs give root %s, not the published %s; nothing was recorded", len(proofs), computed, root)
	}

	tx, err := l.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("receipt: opening the record transaction: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback(ctx)
		}
	}()
	q := l.q.WithTx(tx)
	for i, p := range proofs {
		month, year, sequence, err := ParseSerial(p.Serial)
		if err != nil {
			return err
		}
		period := fmt.Sprintf("%02d%02d", month, year%100)
		err = q.RecordSerial(ctx, receiptdb.RecordSerialParams{
			Period: period, Sequence: int64(sequence), Serial: string(p.Serial), AllocatedAt: timestamptz(at),
		})
		if err != nil {
			return fmt.Errorf("receipt %s: recording its serial: %w", p.Serial, err)
		}
		if err = q.RaiseCounter(ctx, receiptdb.RaiseCounterParams{Period: period, Last: int64(sequence)}); err != nil {
			return fmt.Errorf("receipt %s: raising the %s counter past it: %w", p.Serial, period, err)
		}
		if err = insert(ctx, q, p.Public, commitments[i], leaves[i], at); err != nil {
			return err
		}
	}
	if err = placeInBatch(ctx, q, root, proofSerials(proofs), at); err != nil {
		return err
	}
	if err = tx.Commit(ctx); err != nil {
		return fmt.Errorf("receipt: committing batch %s: %w", root, err)
	}
	return nil
}

func proofSerials(proofs []Proof) []Serial {
	serials := make([]Serial, len(proofs))
	for i, p := range proofs {
		serials[i] = p.Serial
	}
	return serials
}

func insert(ctx context.Context, q *receiptdb.Queries, public PublicBody, commitment, leaf merkle.Hash, at time.Time) error {
	body, err := json.Marshal(public)
	if err != nil {
		return fmt.Errorf("receipt %s: public body: %w", public.Serial, err)
	}
	err = q.InsertReceipt(ctx, receiptdb.InsertReceiptParams{
		Serial: public.Serial, PublicBody: body, PrivateCommitment: commitment.String(), Leaf: leaf.String(), IssuedAt: timestamptz(at),
	})
	if err != nil {
		return fmt.Errorf("receipt %s: storing it: %w", public.Serial, err)
	}
	return nil
}

func placeInBatch(ctx context.Context, q *receiptdb.Queries, root merkle.Hash, serials []Serial, at time.Time) error {
	if err := q.InsertBatch(ctx, receiptdb.InsertBatchParams{Root: root.String(), LeafCount: int32(len(serials)), SealedAt: timestamptz(at)}); err != nil {
		return fmt.Errorf("receipt: storing batch %s: %w", root, err)
	}
	for i, s := range serials {
		if err := q.InsertBatchLeaf(ctx, receiptdb.InsertBatchLeafParams{Root: root.String(), Position: int32(i), Serial: string(s)}); err != nil {
			return fmt.Errorf("receipt %s: placing it in batch %s: %w", s, root, err)
		}
	}
	return nil
}

// Seal puts every issued, unsealed receipt into one batch, in issue order,
// and returns its root. The batch and its leaves land together or not at all.
func (l *Ledger) Seal(ctx context.Context, at time.Time) (merkle.Hash, int, error) {
	pending, err := l.q.UnsealedReceipts(ctx)
	if err != nil {
		return merkle.Hash{}, 0, fmt.Errorf("receipt: reading unsealed receipts: %w", err)
	}
	if len(pending) == 0 {
		return merkle.Hash{}, 0, ErrNothingToSeal
	}
	serials := make([]Serial, len(pending))
	for i, r := range pending {
		serials[i] = Serial(r.Serial)
	}
	root, err := l.seal(ctx, serials, at)
	return root, len(serials), err
}

func (l *Ledger) seal(ctx context.Context, serials []Serial, at time.Time) (root merkle.Hash, err error) {
	names := make([]string, len(serials))
	for i, s := range serials {
		names[i] = string(s)
	}
	stored, err := l.q.ReceiptsBySerial(ctx, names)
	if err != nil {
		return merkle.Hash{}, fmt.Errorf("receipt: reading receipts to seal: %w", err)
	}
	leafOf := make(map[string]string, len(stored))
	for _, r := range stored {
		leafOf[r.Serial] = r.Leaf
	}
	leaves := make([]merkle.Hash, len(serials))
	for i, s := range serials {
		text, ok := leafOf[string(s)]
		if !ok {
			return merkle.Hash{}, fmt.Errorf("receipt %s: %w", s, ErrNotIssued)
		}
		if leaves[i], err = merkle.ParseHash(text); err != nil {
			return merkle.Hash{}, fmt.Errorf("receipt %s: stored leaf: %w", s, err)
		}
	}
	root = merkle.Root(leaves)

	tx, err := l.db.Begin(ctx)
	if err != nil {
		return merkle.Hash{}, fmt.Errorf("receipt: opening the seal transaction: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback(ctx)
		}
	}()
	if err = placeInBatch(ctx, l.q.WithTx(tx), root, serials, at); err != nil {
		return merkle.Hash{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return merkle.Hash{}, fmt.Errorf("receipt: committing batch %s: %w", root, err)
	}
	return root, nil
}

// AnchorMemoPrefix names the scheme and its version inside the memo, so a
// reader can tell an anchor from any other memo the same key might carry,
// and a later format cannot be mistaken for this one.
const AnchorMemoPrefix = "seametry-root-v1:"

// AnchorMemo is the exact memo text that anchors root.
func AnchorMemo(root string) []byte { return []byte(AnchorMemoPrefix + root) }

// Anchor is a batch root written on chain.
type Anchor struct {
	Cluster     string
	Transaction string
	Key         string
	AnchoredAt  time.Time
}

// ProofOf is a serial's published proof and, once its batch is anchored, the
// anchor. The proof is verified before it is returned: a ledger that could
// serve a proof that does not verify would be publishing a false statement.
func (l *Ledger) ProofOf(ctx context.Context, serial Serial) (*Proof, *Anchor, error) {
	if _, err := l.q.GetReceipt(ctx, string(serial)); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil, ErrNotIssued
		}
		return nil, nil, fmt.Errorf("receipt %s: %w", serial, err)
	}
	batch, err := l.q.BatchForSerial(ctx, string(serial))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil, ErrNotSealed
		}
		return nil, nil, fmt.Errorf("receipt %s: finding its batch: %w", serial, err)
	}
	rows, err := l.q.BatchLeaves(ctx, batch.Root)
	if err != nil {
		return nil, nil, fmt.Errorf("receipt: reading batch %s: %w", batch.Root, err)
	}
	leaves := make([]merkle.Hash, len(rows))
	index := -1
	for i, row := range rows {
		if leaves[i], err = merkle.ParseHash(row.Leaf); err != nil {
			return nil, nil, fmt.Errorf("receipt %s: stored leaf: %w", row.Serial, err)
		}
		if row.Serial == string(serial) {
			index = i
		}
	}
	path, err := merkle.InclusionProof(leaves, index)
	if err != nil {
		return nil, nil, err
	}
	var public PublicBody
	own := rows[index]
	if err := json.Unmarshal(own.PublicBody, &public); err != nil {
		return nil, nil, fmt.Errorf("receipt %s: stored public body: %w", serial, err)
	}
	proof := &Proof{Serial: serial, Public: public, PrivateCommitment: own.PrivateCommitment, Path: path, Root: batch.Root}
	if ok, err := proof.Verify(); err != nil || !ok {
		return nil, nil, fmt.Errorf("receipt %s: the stored proof does not verify against root %s (%v); refusing to publish it", serial, batch.Root, err)
	}
	anchor, err := l.anchorOf(ctx, batch.Root)
	return proof, anchor, err
}

// BatchLeaf is one leaf of a published batch: its serial and the digest of
// its public body, never the private commitment's preimage.
type BatchLeaf struct {
	Serial       Serial
	PublicDigest string
}

// BatchOf is a sealed batch's leaves in root order, and its anchor if any.
func (l *Ledger) BatchOf(ctx context.Context, root string) ([]BatchLeaf, *Anchor, error) {
	if _, err := l.q.GetBatch(ctx, root); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil, fmt.Errorf("receipt: no batch has root %s: %w", root, ErrNotSealed)
		}
		return nil, nil, fmt.Errorf("receipt: batch %s: %w", root, err)
	}
	rows, err := l.q.BatchLeaves(ctx, root)
	if err != nil {
		return nil, nil, fmt.Errorf("receipt: reading batch %s: %w", root, err)
	}
	leaves := make([]BatchLeaf, len(rows))
	for i, row := range rows {
		var public PublicBody
		if err := json.Unmarshal(row.PublicBody, &public); err != nil {
			return nil, nil, fmt.Errorf("receipt %s: stored public body: %w", row.Serial, err)
		}
		digest, err := canonical.Digest(public)
		if err != nil {
			return nil, nil, fmt.Errorf("receipt %s: public body: %w", row.Serial, err)
		}
		leaves[i] = BatchLeaf{Serial: Serial(row.Serial), PublicDigest: merkle.Hash(digest).String()}
	}
	anchor, err := l.anchorOf(ctx, root)
	return leaves, anchor, err
}

func (l *Ledger) anchorOf(ctx context.Context, root string) (*Anchor, error) {
	row, err := l.q.GetAnchor(ctx, root)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("receipt: anchor for %s: %w", root, err)
	}
	return &Anchor{Cluster: row.Cluster, Transaction: row.Transaction, Key: row.AnchorKey, AnchoredAt: row.AnchoredAt.Time}, nil
}

// AnchorKey is one key allowed to anchor a root, with the dates it was allowed.
type AnchorKey struct {
	Key        string
	ActiveFrom time.Time
	ActiveTo   *time.Time
}

func (l *Ledger) AnchorKeys(ctx context.Context) ([]AnchorKey, error) {
	rows, err := l.q.ListAnchorKeys(ctx)
	if err != nil {
		return nil, fmt.Errorf("receipt: listing anchor keys: %w", err)
	}
	keys := make([]AnchorKey, len(rows))
	for i, row := range rows {
		keys[i] = AnchorKey{Key: row.Key, ActiveFrom: row.ActiveFrom.Time}
		if row.ActiveTo.Valid {
			to := row.ActiveTo.Time
			keys[i].ActiveTo = &to
		}
	}
	return keys, nil
}

// RegisterAnchorKey publishes key as the one allowed to anchor, when no key
// is active yet. Replacing an active key is a rotation, which needs its own
// published end date and is not built; it is refused rather than done quietly.
func (l *Ledger) RegisterAnchorKey(ctx context.Context, key string, at time.Time) error {
	active, err := l.q.ActiveAnchorKey(ctx)
	switch {
	case err == nil && active.Key == key:
		return nil
	case err == nil:
		return fmt.Errorf("receipt: %s is the active anchor key; publishing %s instead is a rotation, which is not built", active.Key, key)
	case !errors.Is(err, pgx.ErrNoRows):
		return fmt.Errorf("receipt: reading the active anchor key: %w", err)
	}
	return l.q.InsertAnchorKey(ctx, receiptdb.InsertAnchorKeyParams{Key: key, ActiveFrom: timestamptz(at)})
}

// Unanchored lists sealed batch roots not yet written on chain, oldest first.
func (l *Ledger) Unanchored(ctx context.Context) ([]string, error) {
	rows, err := l.q.UnanchoredBatches(ctx)
	if err != nil {
		return nil, fmt.Errorf("receipt: listing unanchored batches: %w", err)
	}
	roots := make([]string, len(rows))
	for i, row := range rows {
		roots[i] = row.Root
	}
	return roots, nil
}

// RecordAnchor records that root was written on chain by the active anchor
// key. An anchor by any other key is refused: the published key list is the
// only thing that lets a stranger tell our anchor from anyone else's memo.
func (l *Ledger) RecordAnchor(ctx context.Context, root string, a Anchor) error {
	active, err := l.q.ActiveAnchorKey(ctx)
	if err != nil {
		return fmt.Errorf("receipt: no active anchor key to record an anchor under: %w", err)
	}
	if active.Key != a.Key {
		return fmt.Errorf("receipt: %s is not the active anchor key (%s); its memo is not an anchor", a.Key, active.Key)
	}
	return l.q.InsertAnchor(ctx, receiptdb.InsertAnchorParams{
		Root: root, Cluster: a.Cluster, Transaction: a.Transaction, AnchorKey: a.Key, AnchoredAt: timestamptz(a.AnchoredAt),
	})
}

func timestamptz(t time.Time) pgtype.Timestamptz {
	return pgtype.Timestamptz{Time: t.UTC(), Valid: true}
}
