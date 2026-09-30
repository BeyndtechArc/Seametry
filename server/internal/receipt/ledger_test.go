package receipt

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/BeyndtechArc/Seametry/server/internal/merkle"
	"github.com/BeyndtechArc/Seametry/server/internal/store"
)

// freshLedger gives each test its own database, created, migrated and
// dropped here, because the ledger's rules are global to a database (one
// active anchor key, one batch per receipt) and Go runs packages' tests in
// parallel against the one SEAMETRY_TEST_DATABASE_URL.
func freshLedger(t *testing.T) (*Ledger, *pgxpool.Pool) {
	t.Helper()
	adminDSN := os.Getenv("SEAMETRY_TEST_DATABASE_URL")
	if adminDSN == "" {
		t.Skip("SEAMETRY_TEST_DATABASE_URL is not set; the ledger's guarantees are Postgres constraints and need a real Postgres to prove")
	}
	ctx := context.Background()
	suffix := make([]byte, 6)
	if _, err := rand.Read(suffix); err != nil {
		t.Fatal(err)
	}
	name := "ledger_" + hex.EncodeToString(suffix)

	admin, err := store.Open(adminDSN)
	if err != nil {
		t.Fatalf("opening the admin connection: %v", err)
	}
	t.Cleanup(func() { admin.Close() })
	if _, err := admin.ExecContext(ctx, "CREATE DATABASE "+name); err != nil {
		t.Fatalf("creating %s: %v", name, err)
	}

	parsed, err := url.Parse(adminDSN)
	if err != nil {
		t.Fatalf("SEAMETRY_TEST_DATABASE_URL is not a URL: %v", err)
	}
	parsed.Path = "/" + name
	dsn := parsed.String()

	db, err := store.Open(dsn)
	if err != nil {
		t.Fatalf("opening %s: %v", name, err)
	}
	if err := store.MigrateAll(ctx, db); err != nil {
		t.Fatalf("migrating %s: %v", name, err)
	}
	db.Close()

	pool, err := store.OpenPool(ctx, dsn)
	if err != nil {
		t.Fatalf("opening a pool on %s: %v", name, err)
	}
	t.Cleanup(func() {
		pool.Close()
		if _, err := admin.ExecContext(ctx, "DROP DATABASE "+name+" WITH (FORCE)"); err != nil {
			t.Errorf("dropping %s: %v", name, err)
		}
	})
	return NewLedger(pool), pool
}

var issuedAt = time.Date(2026, 9, 30, 12, 0, 0, 0, time.UTC)

func TestLedgerAllocatesEverySerialOnceUnderContention(t *testing.T) {
	ledger, _ := freshLedger(t)
	ctx := context.Background()
	const workers, each = 16, 8

	var mu sync.Mutex
	seen := map[Serial]bool{}
	var wg sync.WaitGroup
	errs := make(chan error, workers*each)
	for w := 0; w < workers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := 0; i < each; i++ {
				serial, err := ledger.AllocateSerial(ctx, issuedAt)
				if err != nil {
					errs <- err
					return
				}
				mu.Lock()
				if seen[serial] {
					errs <- errors.New("serial " + string(serial) + " was issued twice")
				}
				seen[serial] = true
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		t.Error(err)
	}
	if len(seen) != workers*each {
		t.Fatalf("allocated %d distinct serials, want %d", len(seen), workers*each)
	}
	for sequence := uint64(1); sequence <= workers*each; sequence++ {
		want, _ := FormatSerial(issuedAt, sequence)
		if !seen[want] {
			t.Errorf("sequence %d (%s) was skipped: allocation must be contiguous", sequence, want)
		}
	}
}

func TestLedgerSealsIssuedReceiptsIntoTheRootAnIndependentBatchComputes(t *testing.T) {
	ledger, _ := freshLedger(t)
	ctx := context.Background()

	receipts := make([]Receipt, 3)
	for i := range receipts {
		serial, err := ledger.AllocateSerial(ctx, issuedAt)
		if err != nil {
			t.Fatal(err)
		}
		receipts[i] = sampleReceipt(t, serial)
		if err := ledger.Issue(ctx, receipts[i], issuedAt.Add(time.Duration(i)*time.Second)); err != nil {
			t.Fatal(err)
		}
	}
	if _, _, err := ledger.ProofOf(ctx, receipts[0].Serial); !errors.Is(err, ErrNotSealed) {
		t.Fatalf("an issued, unsealed receipt answered %v, want ErrNotSealed", err)
	}

	root, count, err := ledger.Seal(ctx, issuedAt.Add(time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	independent, err := NewBatch(receipts)
	if err != nil {
		t.Fatal(err)
	}
	if count != 3 || root != independent.Root() {
		t.Fatalf("sealed %d receipts into %s; an in-memory batch of the same receipts gives %s", count, root, independent.Root())
	}

	for _, r := range receipts {
		proof, anchor, err := ledger.ProofOf(ctx, r.Serial)
		if err != nil {
			t.Fatal(err)
		}
		if ok, err := proof.Verify(); err != nil || !ok {
			t.Errorf("%s: the ledger's proof does not verify (%v)", r.Serial, err)
		}
		if ok, err := proof.VerifyPrivate(r.Private); err != nil || !ok {
			t.Errorf("%s: the owner's private body does not match the stored commitment (%v)", r.Serial, err)
		}
		if anchor != nil {
			t.Errorf("%s: an unanchored batch reported anchor %+v", r.Serial, anchor)
		}
	}

	if _, _, err := ledger.Seal(ctx, issuedAt.Add(2*time.Minute)); !errors.Is(err, ErrNothingToSeal) {
		t.Errorf("sealing with nothing pending answered %v, want ErrNothingToSeal", err)
	}
	if _, _, err := ledger.ProofOf(ctx, "0926ZZZZZZZ"); !errors.Is(err, ErrNotIssued) {
		t.Errorf("a serial nobody issued answered %v, want ErrNotIssued", err)
	}
}

// docs/prd/API.md section 12, step A4: "the public-artifact scan finds no
// signature, wallet or exact amount", run on what the ledger actually serves.
func TestNothingTheLedgerServesCarriesPrivateValues(t *testing.T) {
	ledger, _ := freshLedger(t)
	ctx := context.Background()
	serial, err := ledger.AllocateSerial(ctx, issuedAt)
	if err != nil {
		t.Fatal(err)
	}
	r := sampleReceipt(t, serial)
	if err := ledger.Issue(ctx, r, issuedAt); err != nil {
		t.Fatal(err)
	}
	root, _, err := ledger.Seal(ctx, issuedAt)
	if err != nil {
		t.Fatal(err)
	}
	proof, _, err := ledger.ProofOf(ctx, serial)
	if err != nil {
		t.Fatal(err)
	}
	leaves, _, err := ledger.BatchOf(ctx, root.String())
	if err != nil {
		t.Fatal(err)
	}
	for name, artifact := range map[string]any{"proof": proof, "batch": leaves} {
		encoded, err := json.Marshal(artifact)
		if err != nil {
			t.Fatal(err)
		}
		for label, value := range map[string]string{
			"wallet address": r.Private.Wallet, "transaction signature": r.Private.Signature,
			"approved amount": r.Private.ApprovedAtoms, "settled amount": r.Private.SettledAtoms,
			"floor amount": r.Private.FloorAtoms, "fee amount": r.Private.FeeAtoms, "salt": r.Private.Salt,
		} {
			if strings.Contains(string(encoded), value) {
				t.Errorf("the ledger's %s carries the %s (%q)", name, label, value)
			}
		}
	}
}

func loadDemoBatch(t *testing.T) (merkle.Hash, []Proof) {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "shared", "evidence", "demo-batch", "batch.json"))
	if err != nil {
		t.Fatal(err)
	}
	var published struct {
		Root   string  `json:"root"`
		Proofs []Proof `json:"proofs"`
	}
	if err := json.Unmarshal(raw, &published); err != nil {
		t.Fatal(err)
	}
	root, err := merkle.ParseHash(published.Root)
	if err != nil {
		t.Fatal(err)
	}
	return root, published.Proofs
}

func TestLedgerRecordsThePublishedBatchAndServesTheSameProofs(t *testing.T) {
	ledger, _ := freshLedger(t)
	ctx := context.Background()
	root, proofs := loadDemoBatch(t)

	for run := 0; run < 2; run++ {
		if err := ledger.RecordBatch(ctx, root, proofs, issuedAt); err != nil {
			t.Fatalf("recording the published batch (run %d): %v", run+1, err)
		}
	}
	for _, published := range proofs {
		served, _, err := ledger.ProofOf(ctx, published.Serial)
		if err != nil {
			t.Fatal(err)
		}
		want, _ := json.Marshal(published)
		got, _ := json.Marshal(served)
		if string(got) != string(want) {
			t.Errorf("%s: the ledger serves a different proof than was published\n got %s\nwant %s", published.Serial, got, want)
		}
	}
	leaves, _, err := ledger.BatchOf(ctx, root.String())
	if err != nil {
		t.Fatal(err)
	}
	if len(leaves) != len(proofs) {
		t.Errorf("batch has %d leaves, published %d", len(leaves), len(proofs))
	}
}

func TestLedgerRefusesABatchThatDoesNotReproduceItsRoot(t *testing.T) {
	ledger, pool := freshLedger(t)
	ctx := context.Background()
	root, proofs := loadDemoBatch(t)
	proofs[2].Public.SizeBand = BandOver10000

	if err := ledger.RecordBatch(ctx, root, proofs, issuedAt); err == nil {
		t.Fatal("a batch with one altered public body was recorded; it must be refused")
	}
	var count int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM receipt.receipts").Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Errorf("a refused batch left %d receipts behind; it must record nothing", count)
	}
}

func TestLedgerAnchorsOnlyUnderThePublishedKey(t *testing.T) {
	ledger, pool := freshLedger(t)
	ctx := context.Background()
	root, proofs := loadDemoBatch(t)
	if err := ledger.RecordBatch(ctx, root, proofs, issuedAt); err != nil {
		t.Fatal(err)
	}

	const key, other = "AnchorKey1111111111111111111111111111111111", "OtherKey11111111111111111111111111111111111"
	if err := ledger.RegisterAnchorKey(ctx, key, issuedAt); err != nil {
		t.Fatal(err)
	}
	if err := ledger.RegisterAnchorKey(ctx, key, issuedAt.Add(time.Hour)); err != nil {
		t.Errorf("registering the active key again must change nothing: %v", err)
	}
	if err := ledger.RegisterAnchorKey(ctx, other, issuedAt); err == nil {
		t.Error("a second key was published while one is active; rotation is not built and must be refused")
	}

	pending, err := ledger.Unanchored(ctx)
	if err != nil || len(pending) != 1 || pending[0] != root.String() {
		t.Fatalf("unanchored batches %v (%v), want only %s", pending, err, root)
	}
	anchor := Anchor{Cluster: "devnet", Transaction: "5aMemoSignature", Key: other, AnchoredAt: issuedAt}
	if err := ledger.RecordAnchor(ctx, root.String(), anchor); err == nil {
		t.Error("an anchor under an unpublished key was recorded")
	}
	// A retired key is published, so the foreign key alone would accept it;
	// only the ledger's own check, that the key is the active one, refuses.
	const retired = "RetiredKey111111111111111111111111111111111"
	if _, err := pool.Exec(ctx, "INSERT INTO receipt.anchor_keys (key, active_from, active_to) VALUES ($1, $2, $3)",
		retired, issuedAt.Add(-2*time.Hour), issuedAt.Add(-time.Hour)); err != nil {
		t.Fatal(err)
	}
	anchor.Key = retired
	if err := ledger.RecordAnchor(ctx, root.String(), anchor); err == nil {
		t.Error("an anchor under a retired key was recorded")
	}
	anchor.Key = key
	if err := ledger.RecordAnchor(ctx, root.String(), anchor); err != nil {
		t.Fatal(err)
	}
	if pending, _ := ledger.Unanchored(ctx); len(pending) != 0 {
		t.Errorf("after anchoring, %v still unanchored", pending)
	}
	_, served, err := ledger.ProofOf(ctx, proofs[0].Serial)
	if err != nil || served == nil || served.Transaction != anchor.Transaction || served.Key != key {
		t.Errorf("proof's anchor is %+v (%v), want the recorded one", served, err)
	}
	keys, err := ledger.AnchorKeys(ctx)
	if err != nil || len(keys) != 2 || keys[0].Key != retired || keys[0].ActiveTo == nil || keys[1].Key != key || keys[1].ActiveTo != nil {
		t.Errorf("published keys %+v (%v), want the retired key with its end date, then the active %s", keys, err, key)
	}
}

// TestAnchorMemoIsTheVectorsMemo pins the memo text to
// shared/spec/anchor/vectors.json, which the Explorer's anchor check reads
// against: the anchoring side and the checking side cannot drift apart.
func TestAnchorMemoIsTheVectorsMemo(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "shared", "spec", "anchor", "vectors.json"))
	if err != nil {
		t.Fatal(err)
	}
	var vectors struct {
		Cases []struct {
			Root string `json:"root"`
			Memo string `json:"memo"`
		} `json:"cases"`
	}
	if err := json.Unmarshal(raw, &vectors); err != nil {
		t.Fatal(err)
	}
	if len(vectors.Cases) == 0 {
		t.Fatal("the vector file has no cases")
	}
	for _, c := range vectors.Cases {
		if got := string(AnchorMemo(c.Root)); got != c.Memo {
			t.Errorf("AnchorMemo(%s) = %q, the vector's memo is %q", c.Root, got, c.Memo)
		}
	}
}
