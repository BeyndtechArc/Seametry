package gateway_test

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/BeyndtechArc/Seametry/server/internal/gateway"
	"github.com/BeyndtechArc/Seametry/server/internal/gateway/api"
	"github.com/BeyndtechArc/Seametry/server/internal/registry"
	"github.com/BeyndtechArc/Seametry/server/internal/solana"
)

const hallProgramID = "4wmfRdQguyhGCvZe4FXHo7Kpx5aWbRBHPBbs8k6XRjDx"

type hallFixture struct {
	Address    string `json:"address"`
	Owner      string `json:"owner"`
	Lamports   uint64 `json:"lamports"`
	DataBase64 string `json:"data_base64"`
}

type fakeHall struct {
	alloy  *solana.Account
	assets map[string]*solana.Account
}

func (f fakeHall) GetAccountInfo(_ context.Context, address, _ string) (*solana.Account, error) {
	if f.alloy.Address == address {
		return f.alloy, nil
	}
	return nil, nil
}

func (f fakeHall) GetProgramAccounts(context.Context, string, int, string) ([]*solana.Account, error) {
	return []*solana.Account{f.alloy}, nil
}

func (f fakeHall) GetMultipleAccounts(_ context.Context, addresses []string, _ string) (uint64, []*solana.Account, error) {
	accounts := make([]*solana.Account, len(addresses))
	for i, address := range addresses {
		accounts[i] = f.assets[address]
	}
	return 505629979, accounts, nil
}

func readHallFixture(t *testing.T, name string) *solana.Account {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "shared", "fixtures", "hall-devnet", name))
	if err != nil {
		t.Fatal(err)
	}
	var fixture hallFixture
	if err := json.Unmarshal(raw, &fixture); err != nil {
		t.Fatal(err)
	}
	data, err := base64.StdEncoding.DecodeString(fixture.DataBase64)
	if err != nil {
		t.Fatal(err)
	}
	return &solana.Account{Address: fixture.Address, Owner: fixture.Owner, Lamports: fixture.Lamports, Data: data}
}

func testHall(t *testing.T) (gateway.Server, string) {
	t.Helper()
	alloy := readHallFixture(t, "alloy.json")
	leg0 := readHallFixture(t, "leg-0-hall-account.json")
	leg1 := readHallFixture(t, "leg-1-hall-account.json")

	// Both mock stocks in the captured founding scenario use six decimals.
	// A base SPL mint is sufficient for this boundary: Registry owns the
	// extension decoding, while A5 needs only the scale attached to amounts.
	mintData := make([]byte, 82)
	mintData[44] = 6
	mintData[45] = 1
	assets := map[string]*solana.Account{
		"94L9f6NLadaF9YcDffBw4Ub7tsJb9BJBmFqCUm3zovwH": {Address: "94L9f6NLadaF9YcDffBw4Ub7tsJb9BJBmFqCUm3zovwH", Owner: registry.Token2022ProgramID, Data: mintData},
		"ADcBszQLxMZ4jfcvuTtYpvhDXSeLNHi4MhHFHQrerKyw": {Address: "ADcBszQLxMZ4jfcvuTtYpvhDXSeLNHi4MhHFHQrerKyw", Owner: registry.Token2022ProgramID, Data: mintData},
		leg0.Address: leg0,
		leg1.Address: leg1,
	}
	now := time.Date(2026, 9, 29, 19, 0, 0, 0, time.UTC)
	server := gateway.NewServer(nil, nil).WithHall(fakeHall{alloy: alloy, assets: assets}, hallProgramID, "devnet")
	server.Now = func() time.Time { return now }
	return server, alloy.Address
}

func TestHallEndpointsReadTheCapturedDevnetAlloy(t *testing.T) {
	server, address := testHall(t)
	httpServer := httptest.NewServer(gateway.NewHandler(server))
	t.Cleanup(httpServer.Close)

	for _, path := range []string{"/v1/alloys", "/v1/alloys/" + address} {
		resp, err := http.Get(httpServer.URL + path)
		if err != nil {
			t.Fatal(err)
		}
		if resp.StatusCode != http.StatusOK {
			resp.Body.Close()
			t.Fatalf("GET %s = %d, want 200", path, resp.StatusCode)
		}
		var body struct {
			Data json.RawMessage `json:"data"`
			Meta api.Meta        `json:"meta"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
			resp.Body.Close()
			t.Fatal(err)
		}
		resp.Body.Close()
		if body.Meta.Completeness != api.Complete || body.Meta.Cluster == nil || *body.Meta.Cluster != "devnet" {
			t.Errorf("GET %s meta = %#v", path, body.Meta)
		}
		if len(body.Data) == 0 {
			t.Errorf("GET %s returned empty data", path)
		}
	}

	resp, err := http.Get(httpServer.URL + "/v1/alloys/" + address)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var body struct {
		Data api.Alloy `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body.Data.Supply != "1000000" || len(body.Data.Legs) != 2 {
		t.Fatalf("alloy = %#v", body.Data)
	}
	if body.Data.Legs[0].Ledger.Atoms != "5000000" || body.Data.Legs[0].Ledger.Scale != 6 {
		t.Errorf("leg 0 ledger = %#v, want 5000000 atoms at scale 6", body.Data.Legs[0].Ledger)
	}
	if body.Data.Legs[0].HeldBack || body.Data.Legs[1].HeldBack {
		t.Error("the founding fixture has no frozen Hall account")
	}
}

func TestStrikeAndMeltMatchTheDevnetTranscript(t *testing.T) {
	server, address := testHall(t)
	httpServer := httptest.NewServer(gateway.NewHandler(server))
	t.Cleanup(httpServer.Close)

	cases := []struct {
		path string
		want []string
	}{
		{path: "/v1/alloys/" + address + "/strike-cost?shares=1000", want: []string{"5000", "3000"}},
		{path: "/v1/alloys/" + address + "/melt-proceeds?shares=400", want: []string{"2000", "1200"}},
	}
	for _, tc := range cases {
		resp, err := http.Get(httpServer.URL + tc.path)
		if err != nil {
			t.Fatal(err)
		}
		if resp.StatusCode != http.StatusOK {
			resp.Body.Close()
			t.Fatalf("GET %s = %d, want 200", tc.path, resp.StatusCode)
		}
		var body struct {
			Data api.CostRow `json:"data"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
			resp.Body.Close()
			t.Fatal(err)
		}
		resp.Body.Close()
		for i, want := range tc.want {
			if got := body.Data.Legs[i].Amount.Atoms; got != want {
				t.Errorf("GET %s leg %d atoms = %s, want %s from the devnet transcript", tc.path, i, got, want)
			}
		}
	}
}

func TestHeldBackComesFromTheHallOwnedTokenAccount(t *testing.T) {
	server, address := testHall(t)
	hall := server.Hall.(fakeHall)
	for _, account := range hall.assets {
		if account.Address == "3sxKhEGGstwDtgCKSAX575RWLHrN7jMoMhEdvorYwM7Z" {
			copyOfData := append([]byte(nil), account.Data...)
			copyOfData[108] = 2
			hall.assets[account.Address] = &solana.Account{Address: account.Address, Owner: account.Owner, Data: copyOfData}
		}
	}
	server.Hall = hall
	httpServer := httptest.NewServer(gateway.NewHandler(server))
	t.Cleanup(httpServer.Close)

	resp, err := http.Get(httpServer.URL + "/v1/alloys/" + address)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var body struct {
		Data api.Alloy `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if !body.Data.Legs[0].HeldBack || body.Data.Legs[0].HeldBackReason == nil {
		t.Fatalf("held-back leg = %#v", body.Data.Legs[0])
	}
}

// countingHall lists the same captured Alloy several times and records every
// batch the Gateway asks for, so the register's round trips can be counted.
type countingHall struct {
	fakeHall
	listed  int
	batches *[][]string
}

func (c countingHall) GetProgramAccounts(context.Context, string, int, string) ([]*solana.Account, error) {
	accounts := make([]*solana.Account, c.listed)
	for i := range accounts {
		accounts[i] = c.alloy
	}
	return accounts, nil
}

func (c countingHall) GetMultipleAccounts(ctx context.Context, addresses []string, commitment string) (uint64, []*solana.Account, error) {
	*c.batches = append(*c.batches, addresses)
	return c.fakeHall.GetMultipleAccounts(ctx, addresses, commitment)
}

func TestTheRegisterReadsEveryAlloysAccountsInOneBatch(t *testing.T) {
	server, _ := testHall(t)
	var batches [][]string
	server.Hall = countingHall{fakeHall: server.Hall.(fakeHall), listed: 3, batches: &batches}
	httpServer := httptest.NewServer(gateway.NewHandler(server))
	t.Cleanup(httpServer.Close)

	resp, err := http.Get(httpServer.URL + "/v1/alloys")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var body struct {
		Data []api.Alloy `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if len(body.Data) != 3 {
		t.Fatalf("register returned %d Alloys, want 3", len(body.Data))
	}
	if len(batches) != 1 {
		t.Fatalf("register made %d account reads for 3 Alloys, want 1 batch", len(batches))
	}
	if len(batches[0]) != 4 {
		t.Errorf("batch asked for %d addresses, want the 4 distinct mints and Hall accounts", len(batches[0]))
	}
}

func TestHistoricalHallReadNamesTheMissingPersistence(t *testing.T) {
	server, address := testHall(t)
	httpServer := httptest.NewServer(gateway.NewHandler(server))
	t.Cleanup(httpServer.Close)

	resp, err := http.Get(httpServer.URL + "/v1/alloys/" + address + "?as_of=2026-09-28T00:00:00Z")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotImplemented {
		t.Fatalf("status = %d, want 501", resp.StatusCode)
	}
	var problem api.Problem
	if err := json.NewDecoder(resp.Body).Decode(&problem); err != nil {
		t.Fatal(err)
	}
	if problem.Detail == "" {
		t.Fatal("historical Hall read returned an empty problem detail")
	}
}
