//go:build live

package gateway_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/BeyndtechArc/Seametry/server/internal/gateway"
	"github.com/BeyndtechArc/Seametry/server/internal/gateway/api"
	"github.com/BeyndtechArc/Seametry/server/internal/solana"
)

// TestLiveDevnetHallRead is an explicit network probe, separate from the
// deterministic fixture suite. Run it with:
//
//	SEAMETRY_TEST_SOLANA_RPC_URL=https://api.devnet.solana.com go test -tags=live ./server/internal/gateway -run TestLiveDevnetHallRead -v
func TestLiveDevnetHallRead(t *testing.T) {
	endpoint := os.Getenv("SEAMETRY_TEST_SOLANA_RPC_URL")
	if endpoint == "" {
		t.Fatal("SEAMETRY_TEST_SOLANA_RPC_URL is required for the live test tag")
	}
	client, err := solana.New(endpoint, solana.Options{})
	if err != nil {
		t.Fatal(err)
	}
	server := gateway.NewServer(nil, nil).WithHall(client, hallProgramID, "devnet")
	httpServer := httptest.NewServer(gateway.NewHandler(server))
	t.Cleanup(httpServer.Close)

	resp, err := http.Get(httpServer.URL + "/v1/alloys/6BD6PprLyhiLeXKTAiLRA2hyMwUqMzpQPzftabQuduQ")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		var problem api.Problem
		if err := json.NewDecoder(resp.Body).Decode(&problem); err != nil {
			t.Fatalf("status = %d and problem could not be decoded: %v", resp.StatusCode, err)
		}
		t.Fatalf("status = %d: %s", resp.StatusCode, problem.Detail)
	}
	var body struct {
		Data api.Alloy `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body.Data.Address == "" || len(body.Data.Legs) == 0 {
		t.Fatalf("live Alloy = %#v", body.Data)
	}
	for i, leg := range body.Data.Legs {
		if leg.Ledger.Scale != 6 {
			t.Errorf("live leg %d scale = %d, want 6 from its devnet mint account", i, leg.Ledger.Scale)
		}
	}
}
