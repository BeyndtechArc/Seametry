package main

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/BeyndtechArc/Seametry/server/internal/receipt"
	"github.com/BeyndtechArc/Seametry/server/internal/solana"
)

type fakeChain struct {
	genesis  string
	sent     []solana.SignedTransaction
	statuses []*solana.SignatureStatus // returned in turn; the last repeats
	polls    int
}

func (f *fakeChain) GetGenesisHash(context.Context) (string, error) { return f.genesis, nil }
func (f *fakeChain) GetLatestBlockhash(context.Context) ([32]byte, error) {
	return [32]byte{7}, nil
}
func (f *fakeChain) SendTransaction(_ context.Context, tx solana.SignedTransaction) (string, error) {
	f.sent = append(f.sent, tx)
	return tx.ID(), nil
}
func (f *fakeChain) GetSignatureStatus(context.Context, string) (*solana.SignatureStatus, error) {
	status := f.statuses[min(f.polls, len(f.statuses)-1)]
	f.polls++
	return status, nil
}

type fakeLedger struct {
	registered []string
	pending    []string
	recorded   map[string]receipt.Anchor
}

func (f *fakeLedger) RegisterAnchorKey(_ context.Context, key string, _ time.Time) error {
	f.registered = append(f.registered, key)
	return nil
}
func (f *fakeLedger) Unanchored(context.Context) ([]string, error) { return f.pending, nil }
func (f *fakeLedger) RecordAnchor(_ context.Context, root string, a receipt.Anchor) error {
	f.recorded[root] = a
	return nil
}

func newAnchorRun(t *testing.T, chain *fakeChain, ledger *fakeLedger) anchorRun {
	t.Helper()
	clock := time.Date(2026, 9, 30, 12, 0, 0, 0, time.UTC)
	return anchorRun{
		chain: chain, ledger: ledger, key: ed25519.NewKeyFromSeed(make([]byte, 32)),
		evidenceDir: t.TempDir(),
		now:         func() time.Time { return clock },
		sleep: func(_ context.Context, d time.Duration) error {
			clock = clock.Add(d)
			return nil
		},
		pollEvery: 2 * time.Second, finalizeWithin: 10 * time.Second,
	}
}

const testRoot = "668599c1eb1d299c1383e9efa712774aa1adeaedc4914a7ea8846efee34fbf89"

func finalized() *solana.SignatureStatus {
	return &solana.SignatureStatus{Slot: 42, ConfirmationStatus: "finalized", Err: json.RawMessage("null")}
}

func TestAnchorWritesTheRootsMemoAndRecordsItOnceFinalized(t *testing.T) {
	chain := &fakeChain{genesis: devnetGenesisHash, statuses: []*solana.SignatureStatus{nil, {ConfirmationStatus: "confirmed", Err: json.RawMessage("null")}, finalized()}}
	ledger := &fakeLedger{pending: []string{testRoot}, recorded: map[string]receipt.Anchor{}}
	run := newAnchorRun(t, chain, ledger)

	count, err := run.anchorAll(context.Background())
	if err != nil || count != 1 {
		t.Fatalf("anchorAll = %d, %v; want 1, nil", count, err)
	}
	if len(chain.sent) != 1 || !bytes.HasSuffix(chain.sent[0].Message, receipt.AnchorMemo(testRoot)) {
		t.Fatal("the transaction sent does not carry the root's anchor memo")
	}
	recorded, ok := ledger.recorded[testRoot]
	if !ok || recorded.Transaction != chain.sent[0].ID() || recorded.Cluster != "devnet" || recorded.Key != ledger.registered[0] {
		t.Fatalf("recorded %+v, want the sent transaction on devnet under the registered key", recorded)
	}

	raw, err := os.ReadFile(filepath.Join(run.evidenceDir, testRoot+".json"))
	if err != nil {
		t.Fatalf("no evidence file: %v", err)
	}
	var evidence anchorEvidence
	if err := json.Unmarshal(raw, &evidence); err != nil {
		t.Fatal(err)
	}
	if evidence.Transaction != recorded.Transaction || evidence.Slot != 42 || evidence.Commitment != "finalized" || evidence.Memo != string(receipt.AnchorMemo(testRoot)) {
		t.Errorf("evidence %+v does not name the finalized transaction and its memo", evidence)
	}
}

func TestAnchorSendsNothingToAClusterThatIsNotDevnet(t *testing.T) {
	chain := &fakeChain{genesis: "SomeOtherGenesis", statuses: []*solana.SignatureStatus{finalized()}}
	ledger := &fakeLedger{pending: []string{testRoot}, recorded: map[string]receipt.Anchor{}}
	_, err := newAnchorRun(t, chain, ledger).anchorAll(context.Background())
	if err == nil || !strings.Contains(err.Error(), "SomeOtherGenesis") {
		t.Fatalf("err = %v, want a refusal naming the genesis hash the node reported", err)
	}
	if len(chain.sent) != 0 || len(ledger.registered) != 0 {
		t.Error("something was sent or registered before the cluster was checked")
	}
}

func TestAnchorRecordsNothingForAFailedOrUnfinalizedTransaction(t *testing.T) {
	for name, status := range map[string]*solana.SignatureStatus{
		"failed on chain": {Slot: 42, ConfirmationStatus: "finalized", Err: json.RawMessage(`{"InstructionError":[0,"Custom"]}`)},
		"never finalized": {Slot: 42, ConfirmationStatus: "confirmed", Err: json.RawMessage("null")},
	} {
		t.Run(name, func(t *testing.T) {
			chain := &fakeChain{genesis: devnetGenesisHash, statuses: []*solana.SignatureStatus{status}}
			ledger := &fakeLedger{pending: []string{testRoot}, recorded: map[string]receipt.Anchor{}}
			run := newAnchorRun(t, chain, ledger)
			if _, err := run.anchorAll(context.Background()); err == nil {
				t.Fatal("anchorAll reported success")
			}
			if len(ledger.recorded) != 0 {
				t.Error("an anchor was recorded for a transaction that is not finalized and successful")
			}
			if _, err := os.Stat(filepath.Join(run.evidenceDir, testRoot+".json")); !os.IsNotExist(err) {
				t.Error("evidence was written for a transaction that is not finalized and successful")
			}
		})
	}
}

func TestLoadKeypairReadsASolanaCLIFileAndRefusesAMismatchedOne(t *testing.T) {
	key := ed25519.NewKeyFromSeed(bytes.Repeat([]byte{3}, 32))
	write := func(b []byte) string {
		numbers := make([]string, len(b))
		for i, x := range b {
			numbers[i] = fmt.Sprint(x)
		}
		path := filepath.Join(t.TempDir(), "anchor.json")
		if err := os.WriteFile(path, []byte("["+strings.Join(numbers, ",")+"]"), 0o600); err != nil {
			t.Fatal(err)
		}
		return path
	}

	loaded, err := loadKeypair(write(key))
	if err != nil || !loaded.Equal(key) {
		t.Fatalf("loadKeypair = %v; want the written key", err)
	}
	mismatched := append([]byte{}, key...)
	mismatched[63] ^= 1
	if _, err := loadKeypair(write(mismatched)); err == nil {
		t.Error("a keypair whose public half is not its seed's was accepted")
	}
	if _, err := loadKeypair(write(key[:32])); err == nil {
		t.Error("a 32 byte file was accepted as a keypair")
	}
}
