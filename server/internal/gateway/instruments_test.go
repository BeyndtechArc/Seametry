package gateway_test

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/BeyndtechArc/Seametry/server/internal/gateway"
	"github.com/BeyndtechArc/Seametry/server/internal/gateway/api"
	"github.com/BeyndtechArc/Seametry/server/internal/liquidity"
	"github.com/BeyndtechArc/Seametry/server/internal/store"
	"github.com/BeyndtechArc/Seametry/server/internal/store/observationdb"
)

func repoRoot(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 6; i++ {
		if _, err := os.Stat(filepath.Join(dir, "go.work")); err == nil {
			return dir
		}
		dir = filepath.Dir(dir)
	}
	t.Fatal("could not find the repository root (no go.work found above this package)")
	return ""
}

// seedAAPLx ingests one real instrument's real committed evidence
// (shared/fixtures/mainnet/AAPLx.json and its three
// shared/fixtures/jupiter/AAPLx-*usdc.json captures), the same evidence
// server/cmd/seametry's replay command ingests, so this test exercises A3's
// read path against the same real bytes A2's own tests already check the
// write path with, not a synthetic fixture invented only for this test.
// Returns the mint address and decimals ListInstruments/GetInstrument/
// GetInstrumentDepth/GetInstrumentAdmissibility are then checked against.
func seedAAPLx(t *testing.T, ctx context.Context, queries *observationdb.Queries, objects store.ObjectStore) (mint string, decimals int32) {
	t.Helper()
	root := repoRoot(t)

	var f struct {
		Symbol     string `json:"symbol"`
		Address    string `json:"address"`
		Slot       uint64 `json:"slot"`
		CapturedAt string `json:"captured_at"`
		Owner      string `json:"owner"`
		Lamports   uint64 `json:"lamports"`
		DataBase64 string `json:"data_base64"`
	}
	raw, err := os.ReadFile(filepath.Join(root, "shared", "fixtures", "mainnet", "AAPLx.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatal(err)
	}
	data, err := base64.StdEncoding.DecodeString(f.DataBase64)
	if err != nil {
		t.Fatal(err)
	}
	capturedAt, err := time.Parse(time.RFC3339, f.CapturedAt)
	if err != nil {
		t.Fatal(err)
	}
	solanaIn, err := store.NormalizeSolanaAccount(f.Address, f.Symbol, f.Owner, f.Lamports, f.Slot, data, capturedAt, capturedAt)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Ingest(ctx, objects, queries, solanaIn); err != nil {
		t.Fatalf("seeding the Solana observation: %v", err)
	}

	var report struct {
		Instruments []struct {
			Symbol   string `json:"symbol"`
			Mint     string `json:"mint"`
			Decimals int32  `json:"decimals"`
			Points   []struct {
				SizeUSDC int64 `json:"size_usdc"`
			} `json:"points"`
		} `json:"instruments"`
	}
	reportRaw, err := os.ReadFile(filepath.Join(root, "shared", "evidence", "depth-2026-09-24.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(reportRaw, &report); err != nil {
		t.Fatal(err)
	}
	var inst struct {
		Symbol   string
		Mint     string
		Decimals int32
		Points   []struct{ SizeUSDC int64 }
	}
	for _, i := range report.Instruments {
		if i.Symbol == "AAPLx" {
			inst.Symbol, inst.Mint, inst.Decimals = i.Symbol, i.Mint, i.Decimals
			for _, p := range i.Points {
				inst.Points = append(inst.Points, struct{ SizeUSDC int64 }{p.SizeUSDC})
			}
			break
		}
	}
	if inst.Mint == "" {
		t.Fatal("AAPLx is not in shared/evidence/depth-2026-09-24.json")
	}

	for _, point := range inst.Points {
		capPath := filepath.Join(root, "shared", "fixtures", "jupiter", fmt.Sprintf("AAPLx-%dusdc.json", point.SizeUSDC))
		capRaw, err := os.ReadFile(capPath)
		if err != nil {
			t.Fatal(err)
		}
		var capture struct {
			CapturedAt string `json:"captured_at"`
			Status     int    `json:"status"`
			Body       string `json:"body"`
		}
		if err := json.Unmarshal(capRaw, &capture); err != nil {
			t.Fatal(err)
		}
		received, err := time.Parse(time.RFC3339, capture.CapturedAt)
		if err != nil {
			t.Fatal(err)
		}
		in, err := liquidity.WholeUSDC(point.SizeUSDC)
		if err != nil {
			t.Fatal(err)
		}
		obs, err := liquidity.Replay(liquidity.Request{
			InputMint: liquidity.USDCMint, OutputMint: inst.Mint,
			InputDecimals: liquidity.USDCDecimals, OutputDecimals: inst.Decimals, Amount: in,
		}, capture.Status, []byte(capture.Body), received, liquidity.DefaultTTL)
		if err != nil {
			t.Fatal(err)
		}
		jupiterIn, err := store.NormalizeJupiterObservation(inst.Mint, point.SizeUSDC, obs)
		if err != nil {
			t.Fatal(err)
		}
		if err := store.Ingest(ctx, objects, queries, jupiterIn); err != nil {
			t.Fatalf("seeding the Jupiter observation at %d USDC: %v", point.SizeUSDC, err)
		}
	}
	return inst.Mint, inst.Decimals
}

// newSeededTestServer skips, naming the variable, when
// SEAMETRY_TEST_DATABASE_URL is unset, the same gate every other Postgres
// test in this repository uses.
// newTestBackend skips, naming the variable, when SEAMETRY_TEST_DATABASE_URL
// is unset, the same gate every other Postgres test in this repository
// uses. It migrates a real Postgres and returns a fresh, empty object store
// alongside it: shared by newSeededTestServer and any test that needs to
// insert its own rows directly, such as one proving a single bad mint does
// not take the rest of a list down with it.
func newTestBackend(t *testing.T) (*observationdb.Queries, store.ObjectStore) {
	t.Helper()
	dsn := os.Getenv("SEAMETRY_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("SEAMETRY_TEST_DATABASE_URL is not set; A3's real handlers need a real Postgres to read from")
	}
	ctx := context.Background()

	admin, err := store.Open(dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { admin.Close() })
	if err := store.MigrateAll(ctx, admin); err != nil {
		t.Fatal(err)
	}

	pool, err := store.OpenPool(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	return observationdb.New(pool), store.NewDirObjectStore(t.TempDir())
}

func newSeededTestServer(t *testing.T) (*httptest.Server, string, int32) {
	t.Helper()
	queries, objects := newTestBackend(t)
	mint, decimals := seedAAPLx(t, context.Background(), queries, objects)

	srv := httptest.NewServer(gateway.NewHandler(gateway.NewServer(queries, objects)))
	t.Cleanup(srv.Close)
	return srv, mint, decimals
}

func TestListInstrumentsIncludesASeededMint(t *testing.T) {
	srv, mint, _ := newSeededTestServer(t)
	resp, err := http.Get(srv.URL + "/v1/instruments")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	var body struct {
		Data []api.Instrument `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	found := false
	for _, inst := range body.Data {
		if inst.Mint == mint {
			found = true
			if inst.Grade != "certificate" {
				t.Errorf("grade = %q, want %q (Storm's own choice: match the Explorer's placeholder)", inst.Grade, "certificate")
			}
			if len(inst.Prerogatives) == 0 {
				t.Error("prerogatives is empty for a real, decoded Token-2022 mint")
			}
		}
	}
	if !found {
		t.Errorf("ListInstruments did not include %s, the mint this test just seeded", mint)
	}
}

// TestListInstrumentsSurvivesOneMintWithNoRawBytes is what this session's
// own CI run found the hard way: a second test package sharing this same
// Postgres (every Postgres-gated test in this repository shares one CI
// service container) had inserted an observation whose raw bytes lived in
// a different test's own, already-cleaned-up object store, and
// ListInstruments answered 500 for every instrument because one of them
// could not be read. Fixed in instruments.go, not by hiding the scenario:
// this test recreates it directly, inserting an observation row whose raw
// bytes were never written to this test's own object store at all.
func TestListInstrumentsSurvivesOneMintWithNoRawBytes(t *testing.T) {
	queries, objects := newTestBackend(t)
	ctx := context.Background()
	goodMint, _ := seedAAPLx(t, ctx, queries, objects)

	const badMint = "BrokenMint11111111111111111111111111111111"
	const badDigest = "0000000000000000000000000000000000000000000000000000000000000000"
	now := time.Now().UTC()
	if err := queries.InsertRawPayload(ctx, observationdb.InsertRawPayloadParams{
		Digest: badDigest, Source: "solana:mainnet:getMultipleAccounts", AdapterVersion: "test",
		SourceEventAt: pgtype.Timestamptz{Time: now, Valid: true}, ReceivedAt: pgtype.Timestamptz{Time: now, Valid: true},
		PersistedAt: pgtype.Timestamptz{Time: now, Valid: true}, ObjectKey: badDigest,
	}); err != nil {
		t.Fatalf("inserting the raw_payloads row for the deliberately broken mint: %v", err)
	}
	if _, err := queries.InsertObservation(ctx, observationdb.InsertObservationParams{
		SourceEventAt: pgtype.Timestamptz{Time: now, Valid: true}, ReceivedAt: pgtype.Timestamptz{Time: now, Valid: true},
		PersistedAt: pgtype.Timestamptz{Time: now, Valid: true}, Source: "solana:mainnet:getMultipleAccounts",
		AdapterVersion: "test", VerificationState: "unverified", RawDigest: badDigest, Mint: badMint, RequestKey: badMint,
		Payload: []byte(`{}`),
	}); err != nil {
		t.Fatalf("inserting the observations row for the deliberately broken mint: %v", err)
	}
	// Deliberately no objects.Put for badDigest: this is the missing raw
	// bytes the real CI failure had.

	srv := httptest.NewServer(gateway.NewHandler(gateway.NewServer(queries, objects)))
	t.Cleanup(srv.Close)

	resp, err := http.Get(srv.URL + "/v1/instruments")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200: one mint's missing raw bytes must not fail the whole list", resp.StatusCode)
	}
	var body struct {
		Data []api.Instrument `json:"data"`
		Meta api.Meta         `json:"meta"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	found := false
	for _, inst := range body.Data {
		if inst.Mint == goodMint {
			found = true
		}
		if inst.Mint == badMint {
			t.Errorf("the broken mint appears in data; it should be named in meta.missing instead")
		}
	}
	if !found {
		t.Errorf("the good mint (%s) is missing from a list that should only be missing the broken one", goodMint)
	}
	if body.Meta.Completeness != api.Partial {
		t.Errorf("completeness = %q, want %q", body.Meta.Completeness, api.Partial)
	}
	if body.Meta.Missing == nil {
		t.Fatal("meta.missing is nil, want an entry naming the broken mint")
	}
	namesIt := false
	for _, m := range *body.Meta.Missing {
		if m.Part == "instrument:"+badMint {
			namesIt = true
		}
	}
	if !namesIt {
		t.Errorf("meta.missing = %v, want an entry for instrument:%s", *body.Meta.Missing, badMint)
	}
}

func TestGetInstrumentDecodesTheSeededMint(t *testing.T) {
	srv, mint, _ := newSeededTestServer(t)
	resp, err := http.Get(srv.URL + "/v1/instruments/" + mint)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	var body struct {
		Data api.Instrument `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body.Data.Mint != mint {
		t.Errorf("mint = %q, want %q", body.Data.Mint, mint)
	}
	if body.Data.Capture.Slot == "" || body.Data.Capture.Slot == "0" {
		t.Error("capture.slot is empty or zero for a real, captured account: the fixture's own slot should have carried through")
	}
}

func TestGetInstrumentRefusesAnUncapturedMint(t *testing.T) {
	srv, _, _ := newSeededTestServer(t)
	resp, err := http.Get(srv.URL + "/v1/instruments/NeverCaptured11111111111111111111111111")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", resp.StatusCode)
	}
}

func TestGetInstrumentDepthReturnsThreeRealSizes(t *testing.T) {
	srv, mint, _ := newSeededTestServer(t)
	resp, err := http.Get(srv.URL + "/v1/instruments/" + mint + "/depth")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	var body struct {
		Data api.DepthCurve `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if len(body.Data.Points) != 3 {
		t.Fatalf("depth curve has %d points, want 3 (100, 1000, 10000 USDC, this test's own seeded fixtures)", len(body.Data.Points))
	}
	if body.Data.ReferenceIndex != 0 {
		t.Errorf("reference_index = %d, want 0: AAPLx-100usdc.json's own fixture priced (availability: available)", body.Data.ReferenceIndex)
	}
	for _, p := range body.Data.Points {
		if p.Availability != api.DepthPointAvailabilityAvailable {
			t.Errorf("a point reports availability %q, want %q: every AAPLx fixture in this repository priced", p.Availability, api.DepthPointAvailabilityAvailable)
		}
	}
}

func TestGetInstrumentDepthSellIsUnavailable(t *testing.T) {
	srv, mint, _ := newSeededTestServer(t)
	resp, err := http.Get(srv.URL + "/v1/instruments/" + mint + "/depth?direction=sell")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200 (a completeness: partial answer, not an error)", resp.StatusCode)
	}
	var body struct {
		Meta api.Meta `json:"meta"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body.Meta.Completeness != api.Partial {
		t.Errorf("completeness = %q, want %q", body.Meta.Completeness, api.Partial)
	}
	if body.Meta.Missing == nil || len(*body.Meta.Missing) != 1 || (*body.Meta.Missing)[0].Reason != "SELL_DEPTH_NOT_MEASURED" {
		t.Errorf("missing = %v, want one part naming SELL_DEPTH_NOT_MEASURED", body.Meta.Missing)
	}
}

func TestGetInstrumentAdmissibilityProducesAReproducibleDigest(t *testing.T) {
	srv, mint, _ := newSeededTestServer(t)
	// The same, explicit as_of on both calls: policy.Input.AsOf is itself
	// part of what canonical.Digest hashes (policy.go: "so the same inputs
	// always give the same answer"), so two calls each defaulting to their
	// own now() would legitimately get different digests, correctly, not
	// as a bug. Reproducibility means the same as_of gives the same
	// digest, not that time standing still is assumed.
	asOf := time.Now().UTC().Format(time.RFC3339)
	get := func() api.Decision {
		resp, err := http.Get(srv.URL + "/v1/instruments/" + mint + "/admissibility?as_of=" + asOf)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("status = %d, want 200", resp.StatusCode)
		}
		var body struct {
			Data api.Decision `json:"data"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		return body.Data
	}
	first := get()
	if first.InputDigest == "" {
		t.Fatal("input_digest is empty")
	}
	if !first.Decision.Valid() {
		t.Errorf("decision %q is not one of ALLOW, WARN, BLOCK", first.Decision)
	}
	second := get()
	if second.InputDigest != first.InputDigest {
		t.Errorf("input_digest changed between two reads of the same, unchanged evidence: %s then %s (ENGINEERING_STANDARD.md section 8: identical inputs produce byte identical digests)", first.InputDigest, second.InputDigest)
	}
}
