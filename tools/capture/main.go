// Command capture fetches mint account data from a Solana cluster and writes
// it to fixtures/ exactly as the cluster returned it.
//
// Fixtures are raw evidence, not test data someone invented. Each one records
// the slot it was read at, when it was captured, the commitment level, and a
// SHA-256 of the account bytes, so a decoder test is a statement about what a
// real mint actually contained at a knowable moment rather than about what we
// assumed it would contain.
//
// Usage:
//
//	go run ./tools/capture                 # refresh every target in targets.json
//	go run ./tools/capture -rpc https://...
//
// The default endpoint is the public one, which is rate limited and fine for a
// few dozen accounts. It needs no credentials, which is deliberate: anyone
// checking our work should be able to re-capture these without asking us for
// access.
package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

const defaultRPC = "https://api.mainnet-beta.solana.com"

// Target names a mint worth keeping and says why it earns its place. A fixture
// without a reason becomes a fixture nobody dares delete.
type Target struct {
	Symbol string `json:"symbol"`
	Mint   string `json:"mint"`
	Issuer string `json:"issuer"`
	Note   string `json:"note"`
}

// Fixture is the captured account, written one per file.
type Fixture struct {
	Symbol     string `json:"symbol"`
	Issuer     string `json:"issuer"`
	Note       string `json:"note"`
	Address    string `json:"address"`
	Cluster    string `json:"cluster"`
	Commitment string `json:"commitment"`
	Slot       uint64 `json:"slot"`
	CapturedAt string `json:"captured_at"`
	Owner      string `json:"owner"`
	Lamports   uint64 `json:"lamports"`
	DataSHA256 string `json:"data_sha256"`
	DataLen    int    `json:"data_len"`
	DataBase64 string `json:"data_base64"`
}

type rpcRequest struct {
	JSONRPC string `json:"jsonrpc"`
	ID      int    `json:"id"`
	Method  string `json:"method"`
	Params  []any  `json:"params"`
}

type accountValue struct {
	Data     []string `json:"data"`
	Owner    string   `json:"owner"`
	Lamports uint64   `json:"lamports"`
}

type multipleAccountsResponse struct {
	Result *struct {
		Context struct {
			Slot uint64 `json:"slot"`
		} `json:"context"`
		Value []*accountValue `json:"value"`
	} `json:"result"`
	Error *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

func main() {
	rpc := flag.String("rpc", defaultRPC, "Solana JSON-RPC endpoint")
	dir := flag.String("dir", filepath.Join("fixtures", "mainnet"), "fixture directory")
	commitment := flag.String("commitment", "finalized", "commitment level")
	flag.Parse()

	targets, err := loadTargets(filepath.Join(*dir, "targets.json"))
	if err != nil {
		fail(err)
	}
	fmt.Printf("capturing %d mints from %s at %s commitment\n", len(targets), *rpc, *commitment)

	addresses := make([]string, len(targets))
	for i, t := range targets {
		addresses[i] = t.Mint
	}

	slot, accounts, err := fetchAccounts(*rpc, addresses, *commitment)
	if err != nil {
		fail(err)
	}

	capturedAt := time.Now().UTC().Format(time.RFC3339)
	written := 0
	for i, t := range targets {
		account := accounts[i]
		if account == nil {
			fmt.Printf("  %-10s MISSING: the cluster returned no account\n", t.Symbol)
			continue
		}
		if len(account.Data) < 1 {
			fmt.Printf("  %-10s MISSING: no data returned\n", t.Symbol)
			continue
		}
		raw, err := base64.StdEncoding.DecodeString(account.Data[0])
		if err != nil {
			fmt.Printf("  %-10s UNDECODABLE: %v\n", t.Symbol, err)
			continue
		}
		sum := sha256.Sum256(raw)

		fixture := Fixture{
			Symbol:     t.Symbol,
			Issuer:     t.Issuer,
			Note:       t.Note,
			Address:    t.Mint,
			Cluster:    *rpc,
			Commitment: *commitment,
			Slot:       slot,
			CapturedAt: capturedAt,
			Owner:      account.Owner,
			Lamports:   account.Lamports,
			DataSHA256: hex.EncodeToString(sum[:]),
			DataLen:    len(raw),
			DataBase64: account.Data[0],
		}

		path := filepath.Join(*dir, t.Symbol+".json")
		body, err := json.MarshalIndent(fixture, "", "  ")
		if err != nil {
			fail(err)
		}
		if err := os.WriteFile(path, append(body, '\n'), 0o644); err != nil {
			fail(err)
		}
		fmt.Printf("  %-10s %4d bytes  sha256 %s  -> %s\n", t.Symbol, len(raw), fixture.DataSHA256[:16], path)
		written++
	}
	fmt.Printf("captured %d of %d at slot %d\n", written, len(targets), slot)
}

func loadTargets(path string) ([]Target, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read targets: %w", err)
	}
	var targets []Target
	if err := json.Unmarshal(raw, &targets); err != nil {
		return nil, fmt.Errorf("parse targets: %w", err)
	}
	if len(targets) == 0 {
		return nil, fmt.Errorf("%s lists no targets", path)
	}
	return targets, nil
}

func fetchAccounts(endpoint string, addresses []string, commitment string) (uint64, []*accountValue, error) {
	body, err := json.Marshal(rpcRequest{
		JSONRPC: "2.0",
		ID:      1,
		Method:  "getMultipleAccounts",
		Params: []any{addresses, map[string]string{
			"encoding":   "base64",
			"commitment": commitment,
		}},
	})
	if err != nil {
		return 0, nil, err
	}

	client := &http.Client{Timeout: 45 * time.Second}
	response, err := client.Post(endpoint, "application/json", bytes.NewReader(body))
	if err != nil {
		return 0, nil, fmt.Errorf("rpc: %w", err)
	}
	defer response.Body.Close()

	payload, err := io.ReadAll(response.Body)
	if err != nil {
		return 0, nil, fmt.Errorf("rpc: %w", err)
	}
	if response.StatusCode != http.StatusOK {
		return 0, nil, fmt.Errorf("rpc: HTTP %d: %s", response.StatusCode, truncate(payload, 200))
	}

	var parsed multipleAccountsResponse
	if err := json.Unmarshal(payload, &parsed); err != nil {
		return 0, nil, fmt.Errorf("rpc: %w: %s", err, truncate(payload, 200))
	}
	if parsed.Error != nil {
		return 0, nil, fmt.Errorf("rpc: %d %s", parsed.Error.Code, parsed.Error.Message)
	}
	if parsed.Result == nil {
		return 0, nil, fmt.Errorf("rpc: no result: %s", truncate(payload, 200))
	}
	if len(parsed.Result.Value) != len(addresses) {
		return 0, nil, fmt.Errorf("rpc: asked for %d accounts, got %d", len(addresses), len(parsed.Result.Value))
	}
	return parsed.Result.Context.Slot, parsed.Result.Value, nil
}

func truncate(b []byte, n int) string {
	if len(b) <= n {
		return string(b)
	}
	return string(b[:n]) + "..."
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, "capture:", err)
	os.Exit(1)
}
