// Command explorer generates the public Explorer as static files, from data
// the engine actually produced.
//
// Nothing here is illustrative. The instrument pages are decoded from mint
// accounts captured off mainnet at a recorded slot, the evidence page is the
// survey output, and the verification ritual runs against a batch the Go
// engine sealed. If the engine is wrong, this is visibly wrong.
//
// Static on purpose, for now. prd/EXPLORER.md leaves the choice open at phase
// 1 and notes that static removes a dependency from the critical path. It also
// means the whole surface opens from a file with no server, no build step and
// no network, which is the fastest way to see what has actually been built.
//
// Usage:
//
//	go run ./tools/explorer          # writes dist/explorer
//	go run ./tools/explorer -out X
package main

import (
	"embed"
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	"html/template"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/BeyndtechArc/Seametry/internal/policy"
	"github.com/BeyndtechArc/Seametry/internal/registry"
)

//go:embed assets/*
var assets embed.FS

//go:embed templates/*.html
var templates embed.FS

type fixture struct {
	Symbol     string `json:"symbol"`
	Issuer     string `json:"issuer"`
	Note       string `json:"note"`
	Address    string `json:"address"`
	Slot       uint64 `json:"slot"`
	CapturedAt string `json:"captured_at"`
	Owner      string `json:"owner"`
	DataBase64 string `json:"data_base64"`
}

// Instrument is what the instrument page renders.
type Instrument struct {
	Symbol      string
	Issuer      string
	Note        string
	Address     string
	Slot        uint64
	CapturedAt  string
	Decimals    uint8
	Supply      uint64
	Sentences   []string
	Extensions  []string
	Unknown     []string
	HookState   string
	NaiveValue  string
	LiveValue   string
	Source      string
	EffectiveAt string
	Stale       bool
	Pending     bool

	Decision      string
	Reasons       []policy.Reason
	PolicyVersion string
	InputDigest   string
}

type survey struct {
	CapturedAt            time.Time `json:"captured_at"`
	Slot                  uint64    `json:"slot"`
	MintsDecoded          int       `json:"mints_decoded"`
	WithScaledUIAmount    int       `json:"with_scaled_ui_amount"`
	StaleMultiplier       int       `json:"stale_multiplier_field"`
	PendingActivation     int       `json:"activation_scheduled_not_yet_effective"`
	HaltedByIssuer        int       `json:"halted_by_issuer"`
	WithPermanentDelegate int       `json:"with_permanent_delegate"`
	WithFreezeAuthority   int       `json:"with_freeze_authority"`
	WithDisabledHook      int       `json:"with_transfer_hook_initialized_disabled"`
	WithActiveHook        int       `json:"with_transfer_hook_active"`
	DecodeFailures        []string  `json:"decode_failures"`
	Stale                 []struct {
		Symbol      string `json:"symbol"`
		Underlying  string `json:"underlying"`
		Mint        string `json:"mint"`
		NaiveValue  string `json:"naive_value"`
		LiveValue   string `json:"live_value"`
		EffectiveAt string `json:"effective_at"`
	} `json:"stale"`
}

type page struct {
	Title       string
	Nav         string
	Generated   string
	Instruments []Instrument
	Survey      *survey
	BigSplits   []splitRow
	StalePct    string
	BatchJSON   template.JS
	BatchCount  int
	BatchRoot   string
}

type splitRow struct {
	Symbol, Naive, Live, Since string
}

func main() {
	out := flag.String("out", filepath.Join("dist", "explorer"), "output directory")
	flag.Parse()

	instruments := loadInstruments()
	surveyData := loadSurvey()
	batchRaw, batchCount, batchRoot := loadBatch()

	stalePct := ""
	var splits []splitRow
	if surveyData != nil && surveyData.WithScaledUIAmount > 0 {
		stalePct = fmt.Sprintf("%.1f", 100*float64(surveyData.StaleMultiplier)/float64(surveyData.WithScaledUIAmount))
		for _, s := range surveyData.Stale {
			// A split is a jump from the initial value, which is what makes it
			// catastrophic rather than a drift.
			if s.NaiveValue == "1" && s.LiveValue != "1" && !strings.Contains(s.LiveValue, ".") {
				splits = append(splits, splitRow{s.Symbol, s.NaiveValue, s.LiveValue, s.EffectiveAt[:10]})
			}
		}
		sort.Slice(splits, func(i, j int) bool { return len(splits[i].Live) > len(splits[j].Live) })
	}

	base := page{
		Generated:   time.Now().UTC().Format("2 January 2006, 15:04 UTC"),
		Instruments: instruments,
		Survey:      surveyData,
		StalePct:    stalePct,
		BigSplits:   splits,
		BatchJSON:   template.JS(batchRaw),
		BatchCount:  batchCount,
		BatchRoot:   batchRoot,
	}

	if err := os.MkdirAll(*out, 0o755); err != nil {
		fail(err)
	}

	tmpl := template.Must(template.New("").Funcs(template.FuncMap{
		"short": func(s string) string {
			if len(s) <= 18 {
				return s
			}
			return s[:8] + "…" + s[len(s)-6:]
		},
		"trunc": func(n int, s string) string {
			if len(s) <= n {
				return s
			}
			return s[:n] + "…"
		},
	}).ParseFS(templates, "templates/*.html"))

	pages := []struct{ file, tmpl, title, nav string }{
		{"index.html", "index.html", "Seametry Explorer", "index"},
		{"instruments.html", "instruments.html", "Instruments", "instruments"},
		{"evidence.html", "evidence.html", "Evidence", "evidence"},
		{"verify.html", "verify.html", "Verify a hallmark", "verify"},
	}
	for _, p := range pages {
		data := base
		data.Title = p.title
		data.Nav = p.nav
		file, err := os.Create(filepath.Join(*out, p.file))
		if err != nil {
			fail(err)
		}
		if err := tmpl.ExecuteTemplate(file, p.tmpl, data); err != nil {
			fail(err)
		}
		file.Close()
		fmt.Printf("  %s\n", filepath.Join(*out, p.file))
	}

	// Static assets, plus the fonts if they have been fetched.
	copyEmbedded(*out, "assets/explorer.css", "explorer.css")
	copyEmbedded(*out, "assets/verify.js", "verify.js")
	copyFonts(*out)

	fmt.Printf("\n%d instruments, %d sealed receipts", len(instruments), batchCount)
	if surveyData != nil {
		fmt.Printf(", %d mints surveyed", surveyData.MintsDecoded)
	}
	fmt.Printf("\n\nopen %s\n", filepath.Join(*out, "index.html"))
}

func loadInstruments() []Instrument {
	dir := filepath.Join("fixtures", "mainnet")
	entries, err := os.ReadDir(dir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "explorer: no fixtures (%v); run: go run ./tools/capture\n", err)
		return nil
	}
	// Resolve against a fixed instant so the page means the same thing every
	// time it is generated, rather than drifting with the wall clock.
	asOf := time.Date(2026, 9, 23, 12, 0, 0, 0, time.UTC)

	var out []Instrument
	for _, entry := range entries {
		if entry.IsDir() || entry.Name() == "targets.json" || filepath.Ext(entry.Name()) != ".json" {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(dir, entry.Name()))
		if err != nil {
			continue
		}
		var f fixture
		if err := json.Unmarshal(raw, &f); err != nil {
			continue
		}
		data, err := base64.StdEncoding.DecodeString(f.DataBase64)
		if err != nil {
			continue
		}
		mint, err := registry.DecodeMint(data)
		if err != nil {
			fmt.Fprintf(os.Stderr, "explorer: %s: %v\n", f.Symbol, err)
			continue
		}
		prerogatives, err := mint.Prerogatives()
		if err != nil {
			continue
		}

		inst := Instrument{
			Symbol: f.Symbol, Issuer: f.Issuer, Note: f.Note, Address: f.Address,
			Slot: f.Slot, CapturedAt: f.CapturedAt,
			Decimals: mint.Decimals, Supply: mint.Supply,
			Sentences: prerogatives.Sentences(),
			HookState: prerogatives.TransferHook.State.String(),
		}
		for _, e := range mint.Extensions {
			inst.Extensions = append(inst.Extensions, e.Type.String())
		}
		for _, u := range prerogatives.UnknownExtensions {
			inst.Unknown = append(inst.Unknown, u.String())
		}

		if config, ok, err := mint.ScaledUIAmount(); err == nil && ok {
			if resolved, err := config.Resolve(asOf); err == nil {
				inst.NaiveValue = resolved.NaiveValue.String()
				inst.LiveValue = resolved.Value.String()
				inst.Source = string(resolved.Source)
				inst.EffectiveAt = resolved.EffectiveAt.Format("2 Jan 2006")
				inst.Stale = resolved.NaiveIsStale
				inst.Pending = resolved.ActivationPending
			}
		}
		// The same decision function the engine uses, on the same bytes.
		if in, err := policy.FromRegistry(f.Symbol, f.Address, "certificate", mint, asOf, f.Slot, f.Symbol == "TQQQx" || f.Symbol == "CRDAx", false); err == nil {
			if result, err := policy.Evaluate(policy.Default(), in); err == nil {
				inst.Decision = string(result.Decision)
				inst.Reasons = result.Reasons
				inst.PolicyVersion = result.PolicyVersion
				inst.InputDigest = result.InputDigest
			}
		}

		out = append(out, inst)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Stale != out[j].Stale {
			return out[i].Stale // the interesting ones first
		}
		return out[i].Symbol < out[j].Symbol
	})
	return out
}

func loadSurvey() *survey {
	matches, _ := filepath.Glob(filepath.Join("evidence", "multiplier-staleness-*.json"))
	if len(matches) == 0 {
		fmt.Fprintln(os.Stderr, "explorer: no survey yet; run: go run ./tools/survey")
		return nil
	}
	sort.Strings(matches)
	raw, err := os.ReadFile(matches[len(matches)-1])
	if err != nil {
		return nil
	}
	var s survey
	if err := json.Unmarshal(raw, &s); err != nil {
		return nil
	}
	return &s
}

func loadBatch() (string, int, string) {
	raw, err := os.ReadFile(filepath.Join("evidence", "demo-batch", "batch.json"))
	if err != nil {
		fmt.Fprintln(os.Stderr, "explorer: no sealed batch; run: go run ./tools/seal")
		return "null", 0, ""
	}
	var parsed struct {
		Root   string            `json:"root"`
		Count  int               `json:"count"`
		Proofs []json.RawMessage `json:"proofs"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return "null", 0, ""
	}
	// Only the proofs reach the page. The private bodies in that file exist for
	// the cross-implementation check and have no business in a public surface.
	public := map[string]any{"root": parsed.Root, "proofs": parsed.Proofs}
	encoded, err := json.Marshal(public)
	if err != nil {
		return "null", 0, ""
	}
	return string(encoded), parsed.Count, parsed.Root
}

func copyEmbedded(out, from, to string) {
	data, err := assets.ReadFile(from)
	if err != nil {
		fail(err)
	}
	if err := os.WriteFile(filepath.Join(out, to), data, 0o644); err != nil {
		fail(err)
	}
}

func copyFonts(out string) {
	dir := filepath.Join(out, "fonts")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		fail(err)
	}
	copied := 0
	for _, name := range []string{"Sentient-Variable.woff2", "Switzer-Variable.woff2"} {
		data, err := os.ReadFile(filepath.Join("assets", "fonts", name))
		if err != nil {
			continue
		}
		if err := os.WriteFile(filepath.Join(dir, name), data, 0o644); err != nil {
			fail(err)
		}
		copied++
	}
	if copied < 2 {
		fmt.Fprintln(os.Stderr, "explorer: fonts not found, the page will fall back to system faces; run: go run ./tools/fonts")
	}
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, "explorer:", err)
	os.Exit(1)
}
