// Command survey runs the registry decoder across every tokenized equity an
// issuer publishes and writes what it found to evidence/.
//
// It exists for two reasons. It is the decoder's real test: seven fixtures
// prove the cases we thought of, and a thousand live mints prove the ones we
// did not. And its output is a product claim with its working shown, which is
// the only kind of claim this project makes.
//
// Usage:
//
//	go run ./tools/survey
//	go run ./tools/survey -rpc https://... -out evidence
package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"time"

	"github.com/BeyndtechArc/Seametry/internal/registry"
)

const (
	defaultRPC      = "https://api.mainnet-beta.solana.com"
	xstocksAssets   = "https://api.xstocks.fi/api/v2/public/assets"
	accountsPerCall = 100
)

type asset struct {
	Symbol           string `json:"symbol"`
	UnderlyingSymbol string `json:"underlyingSymbol"`
	IsTradingHalted  bool   `json:"isTradingHalted"`
	Deployments      []struct {
		Network string `json:"network"`
		Address string `json:"address"`
	} `json:"deployments"`
}

type assetPage struct {
	Nodes []asset `json:"nodes"`
	Page  struct {
		CurrentPage int  `json:"currentPage"`
		HasNextPage bool `json:"hasNextPage"`
	} `json:"page"`
}

type finding struct {
	Symbol      string `json:"symbol"`
	Underlying  string `json:"underlying"`
	Mint        string `json:"mint"`
	NaiveValue  string `json:"naive_value"`
	LiveValue   string `json:"live_value"`
	EffectiveAt string `json:"effective_at"`
	Halted      bool   `json:"halted_by_issuer"`
	Paused      bool   `json:"paused_on_chain"`
}

type report struct {
	Source                string         `json:"source"`
	Cluster               string         `json:"cluster"`
	CapturedAt            time.Time      `json:"captured_at"`
	ResolvedAsOf          time.Time      `json:"resolved_as_of"`
	Slot                  uint64         `json:"slot"`
	MintsPublished        int            `json:"mints_published"`
	MintsDecoded          int            `json:"mints_decoded"`
	WithScaledUIAmount    int            `json:"with_scaled_ui_amount"`
	StaleMultiplier       int            `json:"stale_multiplier_field"`
	PendingActivation     int            `json:"activation_scheduled_not_yet_effective"`
	HaltedByIssuer        int            `json:"halted_by_issuer"`
	PausedOnChain         int            `json:"paused_on_chain"`
	WithPermanentDelegate int            `json:"with_permanent_delegate"`
	WithFreezeAuthority   int            `json:"with_freeze_authority"`
	WithDisabledHook      int            `json:"with_transfer_hook_initialized_disabled"`
	WithActiveHook        int            `json:"with_transfer_hook_active"`
	FreezingNewAccounts   int            `json:"default_account_state_frozen"`
	UnknownExtensions     map[string]int `json:"unknown_extensions"`
	DecodeFailures        []string       `json:"decode_failures"`
	Stale                 []finding      `json:"stale"`
}

func main() {
	rpc := flag.String("rpc", defaultRPC, "Solana JSON-RPC endpoint")
	out := flag.String("out", "evidence", "output directory")
	flag.Parse()

	assets, err := fetchAssets()
	if err != nil {
		fail(err)
	}
	fmt.Printf("issuer publishes %d assets with a Solana deployment\n", len(assets))

	asOf := time.Now().UTC()
	rep := report{
		Source:            "xStocks public asset API, decoded from mainnet mint accounts",
		Cluster:           *rpc,
		CapturedAt:        asOf,
		ResolvedAsOf:      asOf,
		MintsPublished:    len(assets),
		UnknownExtensions: map[string]int{},
		// Initialized rather than left nil so that "nothing failed" serializes
		// as an empty list. A consumer should never have to tell null apart
		// from absent to learn that a run was clean.
		DecodeFailures: []string{},
		Stale:          []finding{},
	}

	client := &http.Client{Timeout: 60 * time.Second}
	for start := 0; start < len(assets); start += accountsPerCall {
		end := min(start+accountsPerCall, len(assets))
		batch := assets[start:end]

		addresses := make([]string, len(batch))
		for i, a := range batch {
			addresses[i] = solanaMint(a)
		}

		slot, accounts, err := fetchAccounts(client, *rpc, addresses)
		if err != nil {
			fail(err)
		}
		rep.Slot = slot

		for i, account := range accounts {
			a := batch[i]
			if account == nil || len(account.Data) == 0 {
				rep.DecodeFailures = append(rep.DecodeFailures, a.Symbol+": no account")
				continue
			}
			raw, err := base64.StdEncoding.DecodeString(account.Data[0])
			if err != nil {
				rep.DecodeFailures = append(rep.DecodeFailures, a.Symbol+": "+err.Error())
				continue
			}

			mint, err := registry.DecodeMint(raw)
			if err != nil {
				rep.DecodeFailures = append(rep.DecodeFailures, a.Symbol+": "+err.Error())
				continue
			}
			rep.MintsDecoded++

			prerogatives, err := mint.Prerogatives()
			if err != nil {
				rep.DecodeFailures = append(rep.DecodeFailures, a.Symbol+": prerogatives: "+err.Error())
				continue
			}
			if prerogatives.PermanentDelegate != nil {
				rep.WithPermanentDelegate++
			}
			if prerogatives.FreezeAuthority != nil {
				rep.WithFreezeAuthority++
			}
			switch prerogatives.TransferHook.State {
			case registry.TransferHookInitializedDisabled:
				rep.WithDisabledHook++
			case registry.TransferHookActive:
				rep.WithActiveHook++
			}
			if prerogatives.DefaultAccountState != nil && prerogatives.DefaultAccountState.FreezesNewAccounts() {
				rep.FreezingNewAccounts++
			}
			for _, unknown := range prerogatives.UnknownExtensions {
				rep.UnknownExtensions[unknown.String()]++
			}
			paused := prerogatives.Pausable != nil && prerogatives.Pausable.Paused
			if paused {
				rep.PausedOnChain++
			}
			if a.IsTradingHalted {
				rep.HaltedByIssuer++
			}

			config, ok, err := mint.ScaledUIAmount()
			if err != nil {
				rep.DecodeFailures = append(rep.DecodeFailures, a.Symbol+": scaled ui: "+err.Error())
				continue
			}
			if !ok {
				continue
			}
			rep.WithScaledUIAmount++

			resolved, err := config.Resolve(asOf)
			if err != nil {
				rep.DecodeFailures = append(rep.DecodeFailures, a.Symbol+": resolve: "+err.Error())
				continue
			}
			if resolved.ActivationPending {
				rep.PendingActivation++
			}
			if resolved.NaiveIsStale {
				rep.StaleMultiplier++
				rep.Stale = append(rep.Stale, finding{
					Symbol:      a.Symbol,
					Underlying:  a.UnderlyingSymbol,
					Mint:        solanaMint(a),
					NaiveValue:  resolved.NaiveValue.String(),
					LiveValue:   resolved.Value.String(),
					EffectiveAt: resolved.EffectiveAt.Format(time.RFC3339),
					Halted:      a.IsTradingHalted,
					Paused:      paused,
				})
			}
		}
		fmt.Printf("  decoded %d of %d\n", rep.MintsDecoded, len(assets))
		time.Sleep(500 * time.Millisecond) // the public endpoint is shared
	}

	sort.Slice(rep.Stale, func(i, j int) bool { return rep.Stale[i].Symbol < rep.Stale[j].Symbol })

	if err := os.MkdirAll(*out, 0o755); err != nil {
		fail(err)
	}
	stamp := asOf.Format("2006-01-02")
	path := filepath.Join(*out, "multiplier-staleness-"+stamp+".json")
	body, err := json.MarshalIndent(rep, "", "  ")
	if err != nil {
		fail(err)
	}
	if err := os.WriteFile(path, append(body, '\n'), 0o644); err != nil {
		fail(err)
	}

	fmt.Printf("\nmints decoded              %d\n", rep.MintsDecoded)
	fmt.Printf("carrying ScaledUiAmount    %d\n", rep.WithScaledUIAmount)
	fmt.Printf("stale multiplier field     %d (%.1f%%)\n", rep.StaleMultiplier,
		100*float64(rep.StaleMultiplier)/float64(max(rep.WithScaledUIAmount, 1)))
	fmt.Printf("activation pending         %d\n", rep.PendingActivation)
	fmt.Printf("permanent delegate         %d\n", rep.WithPermanentDelegate)
	fmt.Printf("freeze authority           %d\n", rep.WithFreezeAuthority)
	fmt.Printf("hook present but disabled  %d\n", rep.WithDisabledHook)
	fmt.Printf("hook active                %d\n", rep.WithActiveHook)
	fmt.Printf("new accounts start frozen  %d\n", rep.FreezingNewAccounts)
	fmt.Printf("halted by issuer           %d\n", rep.HaltedByIssuer)
	fmt.Printf("paused on chain            %d\n", rep.PausedOnChain)
	fmt.Printf("unknown extensions         %v\n", rep.UnknownExtensions)
	fmt.Printf("decode failures            %d\n", len(rep.DecodeFailures))
	fmt.Printf("\nwrote %s\n", path)
}

func solanaMint(a asset) string {
	for _, d := range a.Deployments {
		if d.Network == "Solana" {
			return d.Address
		}
	}
	return ""
}

func fetchAssets() ([]asset, error) {
	var out []asset
	client := &http.Client{Timeout: 30 * time.Second}
	for page := 0; page < 50; page++ {
		response, err := client.Get(fmt.Sprintf("%s?page=%d", xstocksAssets, page))
		if err != nil {
			return nil, err
		}
		body, err := io.ReadAll(response.Body)
		response.Body.Close()
		if err != nil {
			return nil, err
		}
		var parsed assetPage
		if err := json.Unmarshal(body, &parsed); err != nil {
			return nil, err
		}
		for _, a := range parsed.Nodes {
			if solanaMint(a) != "" {
				out = append(out, a)
			}
		}
		if !parsed.Page.HasNextPage {
			break
		}
	}
	return out, nil
}

type accountValue struct {
	Data  []string `json:"data"`
	Owner string   `json:"owner"`
}

func fetchAccounts(client *http.Client, endpoint string, addresses []string) (uint64, []*accountValue, error) {
	body, err := json.Marshal(map[string]any{
		"jsonrpc": "2.0", "id": 1, "method": "getMultipleAccounts",
		"params": []any{addresses, map[string]string{"encoding": "base64", "commitment": "finalized"}},
	})
	if err != nil {
		return 0, nil, err
	}
	response, err := client.Post(endpoint, "application/json", bytes.NewReader(body))
	if err != nil {
		return 0, nil, err
	}
	defer response.Body.Close()
	payload, err := io.ReadAll(response.Body)
	if err != nil {
		return 0, nil, err
	}
	var parsed struct {
		Result *struct {
			Context struct {
				Slot uint64 `json:"slot"`
			} `json:"context"`
			Value []*accountValue `json:"value"`
		} `json:"result"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(payload, &parsed); err != nil {
		return 0, nil, err
	}
	if parsed.Error != nil {
		return 0, nil, fmt.Errorf("rpc: %s", parsed.Error.Message)
	}
	if parsed.Result == nil {
		return 0, nil, fmt.Errorf("rpc: no result")
	}
	return parsed.Result.Context.Slot, parsed.Result.Value, nil
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, "survey:", err)
	os.Exit(1)
}
