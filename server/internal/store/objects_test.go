package store_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"testing"

	"github.com/BeyndtechArc/Seametry/server/internal/store"
)

func sha256Hex(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func writeFile(path string, data []byte) error {
	return os.WriteFile(path, data, 0o644)
}

func TestDirObjectStoreRoundTrips(t *testing.T) {
	objects := store.NewDirObjectStore(t.TempDir())
	data := []byte("a raw provider response, unmodified")
	digest := sha256Hex(data)

	if err := objects.Put(context.Background(), digest, data); err != nil {
		t.Fatalf("Put: %v", err)
	}
	got, err := objects.Get(context.Background(), digest)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if string(got) != string(data) {
		t.Errorf("Get returned %q, want %q", got, data)
	}
}

func TestDirObjectStoreRefusesAWrongDigest(t *testing.T) {
	objects := store.NewDirObjectStore(t.TempDir())
	err := objects.Put(context.Background(), "0000000000000000000000000000000000000000000000000000000000000000", []byte("not what that hashes to"))
	if err == nil {
		t.Fatal("Put accepted a digest that does not match its data")
	}
}

func TestDirObjectStoreRefusesAlteredContent(t *testing.T) {
	dir := t.TempDir()
	objects := store.NewDirObjectStore(dir)
	data := []byte("original bytes")
	sum := sha256Hex(data)
	if err := objects.Put(context.Background(), sum, data); err != nil {
		t.Fatalf("Put: %v", err)
	}

	// Alter the stored file directly, the way disk corruption or an
	// out-of-band edit would, and confirm Get refuses it rather than
	// silently returning altered bytes under an unchanged digest.
	path := filepath.Join(dir, sum[:2], sum[2:4], sum)
	if err := writeFile(path, []byte("altered bytes")); err != nil {
		t.Fatalf("corrupting the stored file: %v", err)
	}
	if _, err := objects.Get(context.Background(), sum); err == nil {
		t.Fatal("Get returned altered content without complaint")
	}
}

func TestIngestFailsWhenTheObjectStoreIsUnavailable(t *testing.T) {
	// A store whose root is a file, not a directory: every Put fails at
	// MkdirAll, which is the same failure shape an unreachable R2 bucket
	// or a full disk would produce (docs/ENGINEERING_STANDARD.md section 5:
	// "ingestion fails when the object store is unavailable").
	blocked := t.TempDir()
	blockingFile := filepath.Join(blocked, "not-a-directory")
	if err := writeFile(blockingFile, []byte("x")); err != nil {
		t.Fatal(err)
	}
	objects := store.NewDirObjectStore(filepath.Join(blockingFile, "unreachable"))

	err := store.Ingest(context.Background(), objects, nil, store.IngestInput{
		Mint: "SomeMint", Source: "test", AdapterVersion: "v1",
		VerificationState: "unverified", Raw: []byte("data"), Payload: []byte("{}"),
	})
	if err == nil {
		t.Fatal("Ingest succeeded against an unavailable object store; it must fail before touching Postgres at all (queries is nil here and would panic if reached)")
	}
}
