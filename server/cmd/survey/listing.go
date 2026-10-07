package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/BeyndtechArc/Seametry/server/internal/registry"
	"github.com/BeyndtechArc/Seametry/server/internal/solana"
)

// A listing is one issuer's own published list of Solana mints, each read
// back from the chain. The issuer's list says which mints it claims; the
// chain says whether each exists and whether it carries that issuer's keys
// (registry.Prerogatives.RecognisedIssuer). Both are kept, so a mint the
// issuer lists but the chain does not bear out is visible rather than
// dropped, and a token anyone else lists under the same symbol never enters.

const backpackAssets = "https://api.backpack.exchange/api/v1/assets"

type listedToken struct {
	Symbol string `json:"symbol"`
	Name   string `json:"name,omitempty"`
	Mint   string `json:"mint"`
	// Withdrawable is Backpack's own flag. False means the token exists on
	// Solana but cannot leave the exchange, so no on-chain market holds it.
	Withdrawable *bool `json:"withdrawable,omitempty"`
	Halted       *bool `json:"halted_by_issuer,omitempty"`
	// OnChain is "decoded", "no account", or why the account did not decode.
	OnChain   string `json:"on_chain"`
	Supply    string `json:"supply_atoms,omitempty"`
	Decimals  *uint8 `json:"decimals,omitempty"`
	KeysMatch bool   `json:"keys_match_issuer"`
}

type listing struct {
	Issuer     string        `json:"issuer"`
	Source     string        `json:"source"`
	Cluster    string        `json:"cluster"`
	CapturedAt time.Time     `json:"captured_at"`
	Slot       uint64        `json:"slot"`
	Published  int           `json:"mints_published"`
	Decoded    int           `json:"mints_decoded"`
	KeysMatch  int           `json:"mints_carrying_issuer_keys"`
	Tokens     []listedToken `json:"tokens"`
}

// parseBackpackAssets keeps every US equity Backpack publishes with a Solana
// token. The symbol suffix .US is how Backpack's asset list marks a US stock.
func parseBackpackAssets(body []byte) ([]listedToken, error) {
	var assets []struct {
		Symbol      string `json:"symbol"`
		DisplayName string `json:"displayName"`
		Tokens      []struct {
			Blockchain      string `json:"blockchain"`
			ContractAddress string `json:"contractAddress"`
			WithdrawEnabled bool   `json:"withdrawEnabled"`
		} `json:"tokens"`
	}
	if err := json.Unmarshal(body, &assets); err != nil {
		return nil, fmt.Errorf("Backpack's asset list is not the expected JSON array: %w", err)
	}
	var out []listedToken
	for _, a := range assets {
		if !strings.HasSuffix(a.Symbol, ".US") {
			continue
		}
		for _, t := range a.Tokens {
			if t.Blockchain != "Solana" || t.ContractAddress == "" {
				continue
			}
			withdrawable := t.WithdrawEnabled
			out = append(out, listedToken{Symbol: strings.TrimSuffix(a.Symbol, ".US"), Name: a.DisplayName, Mint: t.ContractAddress, Withdrawable: &withdrawable})
		}
	}
	return out, nil
}

func xstocksListing(assets []asset) []listedToken {
	out := make([]listedToken, 0, len(assets))
	for _, a := range assets {
		halted := a.IsTradingHalted
		out = append(out, listedToken{Symbol: a.Symbol, Name: a.UnderlyingSymbol, Mint: solanaMint(a), Halted: &halted})
	}
	return out
}

// readBack fills each token's chain state, a hundred accounts a call.
func readBack(ctx context.Context, client *solana.Client, l *listing) error {
	for start := 0; start < len(l.Tokens); start += accountsPerCall {
		end := min(start+accountsPerCall, len(l.Tokens))
		addresses := make([]string, 0, end-start)
		for _, t := range l.Tokens[start:end] {
			addresses = append(addresses, t.Mint)
		}
		slot, accounts, err := client.GetMultipleAccounts(ctx, addresses, "finalized")
		if err != nil {
			return fmt.Errorf("reading %s mints %d to %d: %w", l.Issuer, start, end, err)
		}
		l.Slot = slot
		for i, account := range accounts {
			t := &l.Tokens[start+i]
			if account == nil {
				t.OnChain = "no account"
				continue
			}
			mint, err := registry.DecodeMint(account.Data)
			if err != nil {
				t.OnChain = "undecodable: " + err.Error()
				continue
			}
			prerogatives, err := mint.Prerogatives()
			if err != nil {
				t.OnChain = "prerogatives undecodable: " + err.Error()
				continue
			}
			t.OnChain = "decoded"
			t.Supply = fmt.Sprintf("%d", mint.Supply)
			decimals := mint.Decimals
			t.Decimals = &decimals
			l.Decoded++
			if issuer, ok := prerogatives.RecognisedIssuer(); ok && issuer.Name == l.Issuer {
				t.KeysMatch = true
				l.KeysMatch++
			}
		}
		fmt.Printf("  %s: read %d of %d\n", l.Issuer, end, len(l.Tokens))
	}
	return nil
}

func runListings(rpc, out string) error {
	client, err := solana.New(rpc, solana.Options{})
	if err != nil {
		return err
	}
	xstocks, err := fetchAssets()
	if err != nil {
		return fmt.Errorf("xStocks asset list: %w", err)
	}
	backpackBody, err := fetchBody(backpackAssets)
	if err != nil {
		return fmt.Errorf("Backpack asset list: %w", err)
	}
	backpack, err := parseBackpackAssets(backpackBody)
	if err != nil {
		return err
	}
	listings := map[string]*listing{
		"xstocks.json":             {Issuer: "Backed Finance (xStocks)", Source: xstocksAssets, Tokens: xstocksListing(xstocks)},
		"backpack-securities.json": {Issuer: "Backpack Securities", Source: backpackAssets, Tokens: backpack},
	}
	dir := filepath.Join(out, "listings")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	ctx := context.Background()
	for name, l := range listings {
		l.Cluster = solana.RedactEndpoint(rpc)
		l.CapturedAt = time.Now().UTC()
		l.Published = len(l.Tokens)
		sort.Slice(l.Tokens, func(i, j int) bool { return l.Tokens[i].Symbol < l.Tokens[j].Symbol })
		if err := readBack(ctx, client, l); err != nil {
			return err
		}
		body, err := json.MarshalIndent(l, "", "  ")
		if err != nil {
			return err
		}
		path := filepath.Join(dir, name)
		if err := os.WriteFile(path, append(body, '\n'), 0o644); err != nil {
			return err
		}
		fmt.Printf("wrote %s: %d published, %d decoded, %d carrying the issuer's keys\n", path, l.Published, l.Decoded, l.KeysMatch)
	}
	fmt.Printf("rpc: %s\n", client.Usage())
	return nil
}

func fetchBody(url string) ([]byte, error) {
	response, err := (&http.Client{Timeout: 60 * time.Second}).Get(url)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d from %s", response.StatusCode, url)
	}
	return io.ReadAll(response.Body)
}
