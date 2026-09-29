package store

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
)

// ObjectStore is content-addressed storage for raw payloads, keyed by the
// SHA-256 digest of their bytes (docs/ENGINEERING_STANDARD.md section 5:
// "raw before normalized... keyed by SHA-256 of its bytes").
type ObjectStore interface {
	// Put stores data under digest. It is an error for digest to be
	// anything but the lowercase hex SHA-256 of data: a caller that wants
	// to store bytes under the wrong key has misunderstood what content
	// addressing means, and a silent mismatch here is exactly the gap
	// section 5's "durability is not acknowledged if raw capture failed"
	// exists to close.
	Put(ctx context.Context, digest string, data []byte) error
	// Get returns the bytes stored under digest, or an error if none are
	// stored, or if what is stored no longer hashes to digest (the same
	// check liquidity.LoadCapture already makes on its own fixtures: "an
	// altered fixture is not evidence of anything").
	Get(ctx context.Context, digest string) ([]byte, error)
}

// DirObjectStore is the local development and CI implementation
// (docs/prd/API.md section 9.2). Cloudflare R2, the deployed
// implementation, is not built yet: it needs a real bucket and real
// credentials, neither of which exists yet, and an S3 client nothing can
// exercise is not evidence that it works (AGENTS.md: "no half-finished
// implementations"). It is added against a real bucket, the way D1 in
// docs/prd/API.md section 12 is gated on real Fly access, not before.
type DirObjectStore struct {
	Root string
}

func NewDirObjectStore(root string) *DirObjectStore {
	return &DirObjectStore{Root: root}
}

func (d *DirObjectStore) path(digest string) string {
	// Two levels of two-character prefix, the way git's own object store
	// shards its objects, so one directory never holds an unbounded number
	// of files.
	return filepath.Join(d.Root, digest[:2], digest[2:4], digest)
}

func (d *DirObjectStore) Put(ctx context.Context, digest string, data []byte) error {
	if err := verifyDigest(digest, data); err != nil {
		return err
	}
	path := d.path(digest)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("store: creating %s: %w", filepath.Dir(path), err)
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return fmt.Errorf("store: writing %s: %w", path, err)
	}
	return nil
}

func (d *DirObjectStore) Get(ctx context.Context, digest string) ([]byte, error) {
	path := d.path(digest)
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("store: reading %s: %w", path, err)
	}
	if err := verifyDigest(digest, data); err != nil {
		return nil, fmt.Errorf("store: %s was altered since it was stored: %w", path, err)
	}
	return data, nil
}

func verifyDigest(digest string, data []byte) error {
	sum := sha256.Sum256(data)
	got := hex.EncodeToString(sum[:])
	if got != digest {
		return fmt.Errorf("store: digest mismatch: claimed %s, sha256 is %s", digest, got)
	}
	return nil
}
