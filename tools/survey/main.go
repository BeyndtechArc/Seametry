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
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/BeyndtechArc/Seametry/internal/registry"
	"github.com/BeyndtechArc/Seametry/internal/solana"
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
	rpc := flag.String("rpc", solana.EndpointFromEnv(defaultRPC), "Solana JSON-RPC endpoint")
	out := flag.String("out", "evidence", "output directory")
	flag.Parse()

	assets, err := fetchAssets()
	if err != nil {
		fail(err)
	}
	fmt.Printf("issuer publishes %d assets with a Solana deployment\n", len(assets))

	asOf := time.Now().UTC()
	rep := report{
		Source: "xStocks public asset API, decoded from mainnet mint accounts",
		// Redacted, because a provider endpoint usually carries its key in the
		// URL and this file is committed. An evidence artifact naming the
		// cluster is useful; one leaking a credential is a breach.
		Cluster:           solana.RedactEndpoint(*rpc),
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

	// Rate limiting lives in the client, so nothing here has to remember to be
	// polite. The endpoint's own limit is the binding constraint, not a sleep
	// somebody guessed.
	client, err := solana.New(*rpc, solana.Options{})
	if err != nil {
		fail(err)
	}
	ctx := context.Background()

	for start := 0; start < len(assets); start += accountsPerCall {
		end := min(start+accountsPerCall, len(assets))
		batch := assets[start:end]

		addresses := make([]string, len(batch))
		for i, a := range batch {
			addresses[i] = solanaMint(a)
		}

		slot, accounts, err := client.GetMultipleAccounts(ctx, addresses, "finalized")
		if err != nil {
			fail(err)
		}
		rep.Slot = slot

		for i, account := range accounts {
			a := batch[i]
			if account == nil {
				rep.DecodeFailures = append(rep.DecodeFailures, a.Symbol+": no account")
				continue
			}
			raw := account.Data

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
	// The prose note is generated from the same report, so it can never assert
	// a number the data does not contain.
	notePath := strings.TrimSuffix(path, ".json") + ".md"
	if err := os.WriteFile(notePath, []byte(renderNote(rep)), 0o644); err != nil {
		fail(err)
	}

	fmt.Printf("\nwrote %s\n", path)
	fmt.Printf("wrote %s\n", notePath)
	fmt.Printf("rpc:   %s\n", client.Usage())
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

func fail(err error) {
	fmt.Fprintln(os.Stderr, "survey:", err)
	os.Exit(1)
}
