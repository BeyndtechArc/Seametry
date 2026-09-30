package gateway_test

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/BeyndtechArc/Seametry/server/internal/gateway"
	"github.com/BeyndtechArc/Seametry/server/internal/gateway/api"
	"github.com/BeyndtechArc/Seametry/server/internal/merkle"
	"github.com/BeyndtechArc/Seametry/server/internal/receipt"
	"github.com/BeyndtechArc/Seametry/server/internal/store"
)

// demoBatch is shared/evidence/demo-batch as published, with the private
// bodies its demonstration reveals: the served JSON is scanned for them.
type demoBatch struct {
	Root     string          `json:"root"`
	SealedAt time.Time       `json:"sealed_at"`
	Proofs   []receipt.Proof `json:"proofs"`
	Private  map[string]struct {
		Body receipt.PrivateBody `json:"body"`
	} `json:"private_bodies_revealed_for_the_demonstration"`
}

func loadDemoBatch(t *testing.T) demoBatch {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "shared", "evidence", "demo-batch", "batch.json"))
	if err != nil {
		t.Fatal(err)
	}
	var batch demoBatch
	if err := json.Unmarshal(raw, &batch); err != nil {
		t.Fatal(err)
	}
	return batch
}

// newReceiptServer gives each test its own database, because the ledger's
// rules are global to a database (one active anchor key, one batch per
// receipt) and packages' tests run in parallel against one
// SEAMETRY_TEST_DATABASE_URL.
func newReceiptServer(t *testing.T) (*httptest.Server, *receipt.Ledger) {
	t.Helper()
	adminDSN := os.Getenv("SEAMETRY_TEST_DATABASE_URL")
	if adminDSN == "" {
		t.Skip("SEAMETRY_TEST_DATABASE_URL is not set; the receipt endpoints read a real Postgres ledger")
	}
	ctx := context.Background()
	suffix := make([]byte, 6)
	if _, err := rand.Read(suffix); err != nil {
		t.Fatal(err)
	}
	name := "gateway_receipts_" + hex.EncodeToString(suffix)

	admin, err := store.Open(adminDSN)
	if err != nil {
		t.Fatal(err)
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
		t.Fatal(err)
	}
	if err := store.MigrateAll(ctx, db); err != nil {
		t.Fatalf("migrating %s: %v", name, err)
	}
	db.Close()
	pool, err := store.OpenPool(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		pool.Close()
		if _, err := admin.ExecContext(ctx, "DROP DATABASE "+name+" WITH (FORCE)"); err != nil {
			t.Errorf("dropping %s: %v", name, err)
		}
	})

	ledger := receipt.NewLedger(pool)
	srv := httptest.NewServer(gateway.NewHandler(gateway.Server{}.WithReceipts(ledger)))
	t.Cleanup(srv.Close)
	return srv, ledger
}

func getJSON(t *testing.T, target string, into any) (int, []byte) {
	t.Helper()
	resp, err := http.Get(target)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	if into != nil {
		if err := json.Unmarshal(raw, into); err != nil {
			t.Fatalf("decoding %s: %v\n%s", target, err, raw)
		}
	}
	return resp.StatusCode, raw
}

// TestServedReceiptsVerifyWithNoCredentials is A4's exit check: a stranger
// who fetches a receipt and knows nothing else can recompute its leaf and
// walk its path to the published root, and nothing they fetched reveals the
// holder's wallet, signature or an exact amount.
func TestServedReceiptsVerifyWithNoCredentials(t *testing.T) {
	srv, ledger := newReceiptServer(t)
	batch := loadDemoBatch(t)
	root, err := merkle.ParseHash(batch.Root)
	if err != nil {
		t.Fatal(err)
	}
	if err := ledger.RecordBatch(context.Background(), root, batch.Proofs, batch.SealedAt); err != nil {
		t.Fatal(err)
	}

	for _, published := range batch.Proofs {
		var body struct {
			Data receipt.Proof `json:"data"`
			Meta api.Meta      `json:"meta"`
		}
		status, raw := getJSON(t, srv.URL+"/v1/receipts/"+string(published.Serial), &body)
		if status != http.StatusOK {
			t.Fatalf("GET receipt %s = %d: %s", published.Serial, status, raw)
		}
		ok, err := body.Data.Verify()
		if err != nil || !ok {
			t.Fatalf("receipt %s as served does not verify against root %s (%v)", published.Serial, body.Data.Root, err)
		}
		if body.Data.Root != batch.Root {
			t.Errorf("receipt %s names root %s, want the published %s", published.Serial, body.Data.Root, batch.Root)
		}
		if body.Meta.Completeness != api.Partial || body.Meta.Missing == nil || (*body.Meta.Missing)[0].Reason != "BATCH_NOT_ANCHORED" {
			t.Errorf("an unanchored receipt's meta is %+v, want partial with BATCH_NOT_ANCHORED", body.Meta)
		}

		private := batch.Private[string(published.Serial)].Body
		for label, value := range map[string]string{
			"wallet": private.Wallet, "signature": private.Signature, "approved amount": private.ApprovedAtoms,
			"settled amount": private.SettledAtoms, "floor amount": private.FloorAtoms, "fee": private.FeeAtoms, "salt": private.Salt,
		} {
			if value != "" && strings.Contains(string(raw), value) {
				t.Errorf("receipt %s as served contains its %s %q", published.Serial, label, value)
			}
		}
	}

	var got struct {
		Data api.Batch `json:"data"`
	}
	if status, raw := getJSON(t, srv.URL+"/v1/batches/"+batch.Root, &got); status != http.StatusOK {
		t.Fatalf("GET batch = %d: %s", status, raw)
	}
	if len(got.Data.Leaves) != len(batch.Proofs) {
		t.Fatalf("batch has %d leaves, want %d", len(got.Data.Leaves), len(batch.Proofs))
	}
	for i, leaf := range got.Data.Leaves {
		if leaf.Serial != string(batch.Proofs[i].Serial) {
			t.Errorf("leaf %d is %s, want %s: the order is the root's", i, leaf.Serial, batch.Proofs[i].Serial)
		}
	}
}

func TestReceiptAnswersNameWhatIsMissing(t *testing.T) {
	srv, ledger := newReceiptServer(t)
	ctx := context.Background()

	var problem api.Problem
	if status, _ := getJSON(t, srv.URL+"/v1/receipts/not-a-serial", &problem); status != http.StatusBadRequest {
		t.Errorf("a malformed serial answered %d, want 400", status)
	}
	if status, _ := getJSON(t, srv.URL+"/v1/receipts/09260000999", &problem); status != http.StatusNotFound || problem.Title != "Not found" {
		t.Errorf("an unissued serial answered %d %q, want 404 Not found", status, problem.Title)
	}
	if status, _ := getJSON(t, srv.URL+"/v1/batches/zz", &problem); status != http.StatusBadRequest {
		t.Errorf("a malformed root answered %d, want 400", status)
	}
	if status, _ := getJSON(t, srv.URL+"/v1/batches/"+strings.Repeat("ab", 32), &problem); status != http.StatusNotFound {
		t.Errorf("an unknown root answered %d, want 404", status)
	}

	issuedAt := time.Date(2026, 9, 23, 12, 0, 0, 0, time.UTC)
	serial, err := ledger.AllocateSerial(ctx, issuedAt)
	if err != nil {
		t.Fatal(err)
	}
	demo := loadDemoBatch(t).Proofs[0]
	public := demo.Public
	public.Serial = string(serial)
	private := receipt.PrivateBody{Serial: string(serial), Salt: strings.Repeat("00", 32)}
	if err := ledger.Issue(ctx, receipt.Receipt{Serial: serial, Public: public, Private: private}, issuedAt); err != nil {
		t.Fatal(err)
	}
	if status, _ := getJSON(t, srv.URL+"/v1/receipts/"+string(serial), &problem); status != http.StatusNotFound || problem.Title != "Not yet sealed" {
		t.Errorf("an issued, unsealed receipt answered %d %q, want 404 Not yet sealed", status, problem.Title)
	}
}

func TestAnchoredReceiptNamesItsTransactionAndCluster(t *testing.T) {
	srv, ledger := newReceiptServer(t)
	ctx := context.Background()
	batch := loadDemoBatch(t)
	root, _ := merkle.ParseHash(batch.Root)
	if err := ledger.RecordBatch(ctx, root, batch.Proofs, batch.SealedAt); err != nil {
		t.Fatal(err)
	}

	var keys struct {
		Data []api.AnchorKey `json:"data"`
		Meta api.Meta        `json:"meta"`
	}
	if status, raw := getJSON(t, srv.URL+"/v1/anchor-keys", &keys); status != http.StatusOK || len(keys.Data) != 0 || keys.Meta.Completeness != api.Complete {
		t.Fatalf("before any key, anchor-keys = %d %s, want 200, complete and empty", status, raw)
	}

	const key = "AnchorKey1111111111111111111111111111111111"
	if err := ledger.RegisterAnchorKey(ctx, key, batch.SealedAt); err != nil {
		t.Fatal(err)
	}
	if err := ledger.RecordAnchor(ctx, batch.Root, receipt.Anchor{Cluster: "devnet", Transaction: "5aMemoSignature", Key: key, AnchoredAt: batch.SealedAt}); err != nil {
		t.Fatal(err)
	}

	getJSON(t, srv.URL+"/v1/anchor-keys", &keys)
	if len(keys.Data) != 1 || keys.Data[0].Key != key || keys.Data[0].ActiveTo != nil {
		t.Errorf("anchor-keys = %+v, want only the active %s", keys.Data, key)
	}

	var body struct {
		Data api.Proof `json:"data"`
		Meta api.Meta  `json:"meta"`
	}
	getJSON(t, srv.URL+"/v1/receipts/"+string(batch.Proofs[0].Serial), &body)
	if body.Data.Anchor == nil || *body.Data.Anchor.Transaction != "5aMemoSignature" || *body.Data.Anchor.Cluster != "devnet" {
		t.Errorf("anchored receipt's anchor = %+v, want devnet 5aMemoSignature", body.Data.Anchor)
	}
	if body.Meta.Completeness != api.Complete || body.Meta.Cluster == nil || *body.Meta.Cluster != api.MetaClusterDevnet {
		t.Errorf("anchored receipt's meta = %+v, want complete on devnet", body.Meta)
	}
}

func TestReceiptEndpointsWithoutALedgerSayWhy(t *testing.T) {
	srv := newTestServer(t)
	for _, path := range []string{"/v1/receipts/09260000001", "/v1/batches/" + strings.Repeat("ab", 32), "/v1/anchor-keys"} {
		var problem api.Problem
		status, _ := getJSON(t, srv.URL+path, &problem)
		if status != http.StatusServiceUnavailable || problem.Title != "Receipt ledger unavailable" {
			t.Errorf("GET %s with no ledger = %d %q, want 503 Receipt ledger unavailable", path, status, problem.Title)
		}
	}
}
