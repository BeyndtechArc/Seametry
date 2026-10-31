package growth

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/BeyndtechArc/Seametry/server/internal/basket"
	"github.com/BeyndtechArc/Seametry/server/internal/solana"
)

const (
	strikeSignature   = "46aLq1m6ZmPA9wREPubBHA3kXTbbqomk3kUWo3num42nG5b4M6FyYfb65w38MSs4Hzti54mGVwLrGWy3hQfZ83YW"
	withdrawSignature = "2LqzjUN7K3eVejFFYzhub2zVYYj6XsBB4hUmtxpy9JgsNZDUfn8pBJE3ntTpDXR2k6Qf4gdbjiRLFT4dUuZjPPiV"
	devnetPayer       = "FFyrQgpU4BQ2FLesy6t5MmPUDimPj2ghwChTMrLBN5DM"
)

// hallCluster answers getSignaturesForAddress from its list (newest first)
// and getTransaction with the captured devnet answers in
// shared/fixtures/hall-devnet, or null for a signature it holds back.
type hallCluster struct {
	mu         sync.Mutex
	history    []string
	answers    map[string]json.RawMessage
	unanswered map[string]bool
}

func capturedAnswer(t *testing.T, file string) json.RawMessage {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "shared", "fixtures", "hall-devnet", file))
	if err != nil {
		t.Fatal(err)
	}
	var capture struct {
		Result json.RawMessage `json:"result"`
	}
	if err := json.Unmarshal(raw, &capture); err != nil {
		t.Fatal(err)
	}
	return capture.Result
}

func (c *hallCluster) RoundTrip(r *http.Request) (*http.Response, error) {
	var call struct {
		Method string            `json:"method"`
		Params []json.RawMessage `json:"params"`
	}
	if err := json.NewDecoder(r.Body).Decode(&call); err != nil {
		return nil, err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	var result any
	switch call.Method {
	case "getSignaturesForAddress":
		var options struct {
			Before string `json:"before"`
			Limit  int    `json:"limit"`
		}
		_ = json.Unmarshal(call.Params[1], &options)
		start := 0
		if options.Before != "" {
			for i, signature := range c.history {
				if signature == options.Before {
					start = i + 1
				}
			}
		}
		page := []solana.SignatureInfo{}
		for _, signature := range c.history[start:min(len(c.history), start+options.Limit)] {
			page = append(page, solana.SignatureInfo{Signature: signature})
		}
		result = page
	case "getTransaction":
		var signature string
		_ = json.Unmarshal(call.Params[0], &signature)
		if c.unanswered[signature] {
			result = nil
		} else if answer, ok := c.answers[signature]; ok {
			result = answer
		} else {
			return nil, fmt.Errorf("the test cluster holds no transaction %s", signature)
		}
	default:
		return nil, fmt.Errorf("the test cluster does not answer %s", call.Method)
	}
	body, err := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": 1, "result": result})
	if err != nil {
		return nil, err
	}
	return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(string(body))), Header: http.Header{}}, nil
}

func newHallCluster(t *testing.T) (*hallCluster, *solana.Client) {
	t.Helper()
	cluster := &hallCluster{
		history:    []string{withdrawSignature, strikeSignature},
		answers:    map[string]json.RawMessage{strikeSignature: capturedAnswer(t, "tx-create.json"), withdrawSignature: capturedAnswer(t, "tx-withdraw.json")},
		unanswered: map[string]bool{},
	}
	client, err := solana.New("https://rpc.invalid", solana.Options{RequestsPerSecond: 1000, Burst: 1000, HTTPClient: &http.Client{Transport: cluster}})
	if err != nil {
		t.Fatal(err)
	}
	return cluster, client
}

func readHall(t *testing.T, events *Events, chain HallChain) int {
	t.Helper()
	written, err := events.ReadHall(context.Background(), chain, basket.HallDevnetProgramID, "devnet", at)
	if err != nil {
		t.Fatalf("reading the Hall: %v", err)
	}
	return written
}

func TestTheHallReaderNamesEachHallInstructionAsAChainEvent(t *testing.T) {
	events, _, _ := fresh(t)
	_, chain := newHallCluster(t)
	written := readHall(t, events, chain)
	got := timeline(t, events)
	if len(got) != written || written < 2 {
		t.Fatalf("%d events written and %d in the payer's timeline; want the captured Strike and every withdraw beside it", written, len(got))
	}
	types := map[string]int{}
	for _, event := range got {
		types[event.Type]++
		if event.Source != "chain" || event.Origin != "hall.devnet" || event.Wallet != devnetPayer {
			t.Errorf("%s: source %s, origin %s, wallet %s; want chain, hall.devnet, the fee payer %s", event.Type, event.Source, event.Origin, event.Wallet, devnetPayer)
		}
		var properties map[string]any
		if err := json.Unmarshal(event.Properties, &properties); err != nil {
			t.Fatal(err)
		}
		switch event.Type {
		case "alloy.struck":
			if properties["signature"] != strikeSignature || properties["share_atoms"] == nil {
				t.Errorf("the Strike carries %v; want its signature and its share atoms", properties)
			}
		case "leg.withdrawn":
			if properties["signature"] != withdrawSignature || properties["unit_atoms"] == nil || properties["leg_index"] == nil {
				t.Errorf("a withdraw carries %v; want its signature, leg index and unit atoms", properties)
			}
		}
		if properties["error"] != nil {
			t.Errorf("%s from a transaction that succeeded carries the error %v", event.Type, properties["error"])
		}
	}
	// One transaction can call the Hall several times; each call is an event.
	var captured struct {
		Transaction struct {
			Message struct {
				Instructions []struct {
					ProgramID string `json:"programId"`
				} `json:"instructions"`
			} `json:"message"`
		} `json:"transaction"`
	}
	if err := json.Unmarshal(capturedAnswer(t, "tx-withdraw.json"), &captured); err != nil {
		t.Fatal(err)
	}
	withdraws := 0
	for _, instruction := range captured.Transaction.Message.Instructions {
		if instruction.ProgramID == basket.HallDevnetProgramID {
			withdraws++
		}
	}
	if types["alloy.struck"] != 1 || types["leg.withdrawn"] != withdraws || withdraws < 2 || len(types) != 2 {
		t.Errorf("event types %v; want one alloy.struck and the capture's %d withdraws", types, withdraws)
	}
	// Oldest first, as the chain ordered them: the Strike came before the withdraw.
	struck, withdrawn := time.Time{}, time.Time{}
	for _, event := range got {
		switch event.Type {
		case "alloy.struck":
			struck = event.OccurredAt
		case "leg.withdrawn":
			withdrawn = event.OccurredAt
		}
	}
	if !struck.Before(withdrawn) || struck.Equal(at) {
		t.Errorf("struck at %s, withdrawn at %s; want each at its block time, the Strike first", struck, withdrawn)
	}
}

func TestReadingTheHallAgainWritesOnlyWhatIsNew(t *testing.T) {
	events, _, _ := fresh(t)
	cluster, chain := newHallCluster(t)
	first := readHall(t, events, chain)
	if again := readHall(t, events, chain); again != 0 {
		t.Fatalf("a second pass with nothing new wrote %d events", again)
	}
	// A newer transaction calling the Hall with data no instruction names.
	newer := "3QqMvYrGuvj2WuXG7k1EAnbRrkZGkNYHkVMmuBjrW7oBY2zHJLNRrVtwpDAiwuznaqyjJE3yGLk1hj6EBeAtA9XX"
	var unknown map[string]any
	if err := json.Unmarshal(capturedAnswer(t, "tx-create.json"), &unknown); err != nil {
		t.Fatal(err)
	}
	var withdrawn map[string]any
	if err := json.Unmarshal(capturedAnswer(t, "tx-withdraw.json"), &withdrawn); err != nil {
		t.Fatal(err)
	}
	unknown["blockTime"] = withdrawn["blockTime"].(float64) + 60
	transaction := unknown["transaction"].(map[string]any)
	transaction["signatures"] = []any{newer}
	for _, instruction := range transaction["message"].(map[string]any)["instructions"].([]any) {
		entry := instruction.(map[string]any)
		if entry["programId"] == basket.HallDevnetProgramID {
			entry["data"] = "11111111111"
		}
	}
	encoded, err := json.Marshal(unknown)
	if err != nil {
		t.Fatal(err)
	}
	cluster.mu.Lock()
	cluster.history = append([]string{newer}, cluster.history...)
	cluster.answers[newer] = encoded
	cluster.mu.Unlock()
	if written := readHall(t, events, chain); written != 1 {
		t.Fatalf("a pass after one new transaction wrote %d events, want 1", written)
	}
	got := timeline(t, events)
	if len(got) != first+1 || got[0].Type != "hall.unrecognised" {
		t.Fatalf("newest event %s of %d; want hall.unrecognised, kept rather than dropped, on top of the %d read before", got[0].Type, len(got), first)
	}
}

func TestATransactionTheClusterCannotReturnYetIsReadOnTheNextPass(t *testing.T) {
	events, _, _ := fresh(t)
	cluster, chain := newHallCluster(t)
	// The older one is held back: reading past it would move the cursor
	// beyond a transaction no later pass could return to.
	cluster.unanswered[strikeSignature] = true
	if written := readHall(t, events, chain); written != 0 {
		t.Fatalf("with the oldest transaction unavailable, a pass wrote %d events; want it to stop there", written)
	}
	delete(cluster.unanswered, strikeSignature)
	if written := readHall(t, events, chain); written == 0 {
		t.Fatal("once the cluster returned it, the held-back transaction was never read")
	}
	types := map[string]int{}
	for _, event := range timeline(t, events) {
		types[event.Type]++
	}
	if types["alloy.struck"] != 1 || types["leg.withdrawn"] == 0 {
		t.Errorf("event types %v after both passes; want the Strike once and the withdraws", types)
	}
}

func TestACursorTheHistoryNoLongerReturnsStopsThePass(t *testing.T) {
	events, _, _ := fresh(t)
	cluster, chain := newHallCluster(t)
	readHall(t, events, chain)
	cluster.mu.Lock()
	cluster.history = cluster.history[1:]
	cluster.mu.Unlock()
	if _, err := events.ReadHall(context.Background(), chain, basket.HallDevnetProgramID, "devnet", at); err == nil || !strings.Contains(err.Error(), "no longer returns") {
		t.Fatalf("a cursor missing from the history answered %v; want the pass refused, naming it", err)
	}
}
