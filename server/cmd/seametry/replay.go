package main

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/BeyndtechArc/Seametry/server/internal/liquidity"
	"github.com/BeyndtechArc/Seametry/server/internal/merkle"
	"github.com/BeyndtechArc/Seametry/server/internal/receipt"
	"github.com/BeyndtechArc/Seametry/server/internal/store"
	"github.com/BeyndtechArc/Seametry/server/internal/store/observationdb"
)

// replay ingests shared/fixtures/mainnet/*.json and the Jupiter captures
// shared/evidence/depth-2026-09-24.json cites, as the first raw payloads,
// keeping each one's own recorded time rather than the instant replay runs
// (docs/prd/API.md section 12 step A2: "keeping their own capture times, so
// the store is never empty of real evidence"). It never invents a capture:
// every byte ingested here was already committed to the repository as
// evidence before this command existed.
//
// root is the repository root the fixtures and evidence live under: "."
// when run the conventional way (go run ./server/cmd/seametry replay, from
// the repository root, per go.work's own comment on why every program here
// reads shared/ relative to it), or an absolute path in a test, whose
// working directory go test sets to the package directory instead.
//
// This only runs from a full repository checkout, never inside the
// deployed container: server/deploy/Dockerfile's build context is server/
// alone, so the built image carries no shared/ directory to replay from.
// Point SEAMETRY_DATABASE_URL at the target database and run this from a
// checkout (a developer's machine or CI), the same way cmd/capture and
// cmd/depth are already run, rather than from inside what serve deploys.
func replay(root string) error {
	dsn := os.Getenv("SEAMETRY_DATABASE_URL")
	if dsn == "" {
		return errors.New("SEAMETRY_DATABASE_URL is not set; replay needs a connection that can write to the observation schema")
	}
	objectDir := os.Getenv("SEAMETRY_OBJECT_STORE_DIR")
	if objectDir == "" {
		objectDir = filepath.Join(root, "server", "data", "objects")
	}

	solanaInputs, err := loadSolanaFixtureInputs(filepath.Join(root, "shared", "fixtures", "mainnet"))
	if err != nil {
		return err
	}
	jupiterInputs, err := loadJupiterFixtureInputs(
		filepath.Join(root, "shared", "evidence", "depth-2026-09-24.json"),
		filepath.Join(root, "shared", "fixtures", "jupiter"),
	)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	pool, err := store.OpenPool(ctx, dsn)
	if err != nil {
		return fmt.Errorf("opening SEAMETRY_DATABASE_URL: %w", err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		return fmt.Errorf("pinging SEAMETRY_DATABASE_URL: %w", err)
	}

	objects := store.NewDirObjectStore(objectDir)
	queries := observationdb.New(pool)

	for _, in := range solanaInputs {
		if err := store.Ingest(ctx, objects, queries, in); err != nil {
			return fmt.Errorf("replaying %s: %w", in.Mint, err)
		}
	}
	for _, in := range jupiterInputs {
		if err := store.Ingest(ctx, objects, queries, in); err != nil {
			return fmt.Errorf("replaying %s: %w", in.Mint, err)
		}
	}
	slog.Info("seametry: replayed the committed evidence", "solana_accounts", len(solanaInputs), "jupiter_quotes", len(jupiterInputs))
	return nil
}

// recordDemoBatch writes shared/evidence/demo-batch into the receipt ledger,
// so the receipt, batch and anchor-key endpoints have a batch to serve and
// the devnet anchor has a root to write.
//
// It is deliberately not part of replay. The batch's bodies are invented
// and read "finalized", and it takes serials 1 to 5 of September 2026, so
// in a ledger that also holds real allocations the Gateway would serve
// invented receipts beside real ones with nothing on either to tell them
// apart. Run it only against a demonstration database.
func recordDemoBatch(root string) error {
	dsn := os.Getenv("SEAMETRY_DATABASE_URL")
	if dsn == "" {
		return errors.New("SEAMETRY_DATABASE_URL is not set; record-demo-batch needs a connection that can write to the receipt schema of a demonstration database")
	}
	path := filepath.Join(root, "shared", "evidence", "demo-batch", "batch.json")
	batchRoot, proofs, sealedAt, err := loadDemoBatch(path)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	pool, err := store.OpenPool(ctx, dsn)
	if err != nil {
		return fmt.Errorf("opening SEAMETRY_DATABASE_URL: %w", err)
	}
	defer pool.Close()
	if err := receipt.NewLedger(pool).RecordBatch(ctx, batchRoot, proofs, sealedAt); err != nil {
		return fmt.Errorf("recording %s: %w", path, err)
	}
	slog.Info("seametry: recorded the demonstration batch", "root", batchRoot.String(), "receipts", len(proofs))
	return nil
}

// loadDemoBatch reads the published batch. It checks nothing itself:
// RecordBatch refuses proofs that do not reproduce the root.
func loadDemoBatch(path string) (merkle.Hash, []receipt.Proof, time.Time, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return merkle.Hash{}, nil, time.Time{}, fmt.Errorf("reading %s: %w", path, err)
	}
	var batch struct {
		Root     string          `json:"root"`
		SealedAt time.Time       `json:"sealed_at"`
		Count    int             `json:"count"`
		Proofs   []receipt.Proof `json:"proofs"`
	}
	if err := json.Unmarshal(raw, &batch); err != nil {
		return merkle.Hash{}, nil, time.Time{}, fmt.Errorf("decoding %s: %w", path, err)
	}
	if batch.Count != len(batch.Proofs) {
		return merkle.Hash{}, nil, time.Time{}, fmt.Errorf("%s: count is %d but it carries %d proofs", path, batch.Count, len(batch.Proofs))
	}
	root, err := merkle.ParseHash(batch.Root)
	if err != nil {
		return merkle.Hash{}, nil, time.Time{}, fmt.Errorf("%s: root: %w", path, err)
	}
	return root, batch.Proofs, batch.SealedAt, nil
}

// mainnetFixture mirrors server/cmd/capture's own Fixture struct. It is
// duplicated rather than imported: cmd/capture is a separate command and
// neither owns a shared package boundary worth creating for one struct.
// DisallowUnknownFields on every decode (below) is the drift guard: a field
// added to one struct and not the other fails loudly the first time this
// package decodes a real fixture, in TestLoadSolanaFixtureInputsReadsEveryFixture.
type mainnetFixture struct {
	Symbol     string `json:"symbol"`
	Address    string `json:"address"`
	Slot       uint64 `json:"slot"`
	CapturedAt string `json:"captured_at"`
	Owner      string `json:"owner"`
	Lamports   uint64 `json:"lamports"`
	DataSHA256 string `json:"data_sha256"`
	DataBase64 string `json:"data_base64"`

	Issuer     string `json:"issuer"`
	Note       string `json:"note"`
	Cluster    string `json:"cluster"`
	Commitment string `json:"commitment"`
	DataLen    int    `json:"data_len"`
}

// loadSolanaFixtureInputs reads every committed mainnet fixture in dir
// (skipping targets.json, which lists what to capture rather than
// recording a capture) and normalizes each into an IngestInput, verifying
// its digest along the way. It touches no network and no database, so it
// is fully exercised by a test against the real fixtures in the repository.
func loadSolanaFixtureInputs(dir string) ([]store.IngestInput, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("reading %s: %w", dir, err)
	}

	var inputs []store.IngestInput
	for _, entry := range entries {
		if entry.IsDir() || entry.Name() == "targets.json" || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		path := filepath.Join(dir, entry.Name())
		raw, err := os.ReadFile(path)
		if err != nil {
			return nil, fmt.Errorf("reading %s: %w", path, err)
		}
		var f mainnetFixture
		dec := json.NewDecoder(strings.NewReader(string(raw)))
		dec.DisallowUnknownFields()
		if err := dec.Decode(&f); err != nil {
			return nil, fmt.Errorf("decoding %s: %w", path, err)
		}

		data, err := base64.StdEncoding.DecodeString(f.DataBase64)
		if err != nil {
			return nil, fmt.Errorf("%s: data_base64 does not decode: %w", path, err)
		}
		sum := sha256.Sum256(data)
		if got := hex.EncodeToString(sum[:]); got != f.DataSHA256 {
			return nil, fmt.Errorf("%s: data_sha256 is %s, the stored bytes hash to %s; the fixture was altered since capture", path, f.DataSHA256, got)
		}

		capturedAt, err := time.Parse(time.RFC3339, f.CapturedAt)
		if err != nil {
			return nil, fmt.Errorf("%s: captured_at %q does not parse: %w", path, f.CapturedAt, err)
		}

		input, err := store.NormalizeSolanaAccount(f.Address, f.Symbol, f.Owner, f.Lamports, f.Slot, data, capturedAt, capturedAt)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", path, err)
		}
		inputs = append(inputs, input)
	}
	return inputs, nil
}

// jupiterDepthReport mirrors server/cmd/depth's own report struct, for the
// same reason mainnetFixture mirrors capture's Fixture.
type jupiterDepthReport struct {
	CapturedAt  time.Time `json:"captured_at"`
	Instruments []struct {
		Symbol   string `json:"symbol"`
		Mint     string `json:"mint"`
		Decimals int32  `json:"decimals"`
		Points   []struct {
			SizeUSDC int64 `json:"size_usdc"`
		} `json:"points"`
	} `json:"instruments"`
}

// jupiterCapture mirrors liquidity.Capture (server/internal/liquidity/
// capture.go), which is already exported; it is duplicated here rather than
// used as a decode target only so this file can decode with
// DisallowUnknownFields as the same drift guard mainnetFixture uses.
type jupiterCapture struct {
	Symbol     string `json:"symbol"`
	Mint       string `json:"mint"`
	SizeUSDC   int64  `json:"size_usdc"`
	CapturedAt string `json:"captured_at"`
	Status     int    `json:"status"`
	SHA256     string `json:"sha256"`
	Body       string `json:"body"`
}

// loadJupiterFixtureInputs reads reportPath (the published finding) and,
// for each point it cites, the raw capture fixtureDir holds, replaying it
// through liquidity.Replay exactly as server/cmd/depth's own LoadCurve does,
// so a replayed observation and a freshly captured one are the same
// function's output either way. It touches no network and no database.
func loadJupiterFixtureInputs(reportPath, fixtureDir string) ([]store.IngestInput, error) {
	raw, err := os.ReadFile(reportPath)
	if err != nil {
		return nil, fmt.Errorf("reading %s: %w", reportPath, err)
	}
	var report jupiterDepthReport
	if err := json.Unmarshal(raw, &report); err != nil {
		return nil, fmt.Errorf("decoding %s: %w", reportPath, err)
	}

	var inputs []store.IngestInput
	for _, inst := range report.Instruments {
		for _, point := range inst.Points {
			capturePath := filepath.Join(fixtureDir, fmt.Sprintf("%s-%dusdc.json", inst.Symbol, point.SizeUSDC))
			capRaw, err := os.ReadFile(capturePath)
			if err != nil {
				return nil, fmt.Errorf("reading %s: %w", capturePath, err)
			}
			var capture jupiterCapture
			dec := json.NewDecoder(strings.NewReader(string(capRaw)))
			dec.DisallowUnknownFields()
			if err := dec.Decode(&capture); err != nil {
				return nil, fmt.Errorf("decoding %s: %w", capturePath, err)
			}
			sum := sha256.Sum256([]byte(capture.Body))
			if got := hex.EncodeToString(sum[:]); got != capture.SHA256 {
				return nil, fmt.Errorf("%s: sha256 is %s, the stored body hashes to %s; the capture was altered since it was written", capturePath, capture.SHA256, got)
			}
			received, err := time.Parse(time.RFC3339, capture.CapturedAt)
			if err != nil {
				return nil, fmt.Errorf("%s: captured_at %q does not parse: %w", capturePath, capture.CapturedAt, err)
			}

			in, err := liquidity.WholeUSDC(point.SizeUSDC)
			if err != nil {
				return nil, err
			}
			obs, err := liquidity.Replay(liquidity.Request{
				InputMint: liquidity.USDCMint, OutputMint: inst.Mint,
				InputDecimals: liquidity.USDCDecimals, OutputDecimals: inst.Decimals, Amount: in,
			}, capture.Status, []byte(capture.Body), received, liquidity.DefaultTTL)
			if err != nil {
				return nil, fmt.Errorf("%s: replaying: %w", capturePath, err)
			}

			input, err := store.NormalizeJupiterObservation(inst.Mint, point.SizeUSDC, obs)
			if err != nil {
				return nil, fmt.Errorf("%s: %w", capturePath, err)
			}
			inputs = append(inputs, input)
		}
	}
	return inputs, nil
}
