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
//	go run ./server/cmd/explorer          # writes dist/explorer
//	go run ./server/cmd/explorer -out X
package main

import (
	"bytes"
	"crypto/sha256"
	"embed"
	"encoding/base64"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"html/template"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/BeyndtechArc/Seametry/server/internal/liquidity"
	"github.com/BeyndtechArc/Seametry/server/internal/policy"
	"github.com/BeyndtechArc/Seametry/server/internal/receipt"
	"github.com/BeyndtechArc/Seametry/server/internal/registry"
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

	Decision         string
	Reasons          []policy.Reason
	PolicyVersion    string
	InputDigest      string
	Depth            []DepthRow
	Admission        Admission
	CapacityUSDC     int64
	CapacityDecision policy.Result
}

// DepthRow is one measured size on an instrument's depth curve.
type DepthRow struct {
	SizeUSDC     int64
	Availability string
	Code         string
	Shortfall    string
	Venues       string
}

// decisionsAsOf is the fixed instant every decision and multiplier is resolved
// at, so the pages and the admissions snapshot mean the same thing every time
// they are generated, rather than drifting with the wall clock.
var decisionsAsOf = time.Date(2026, 9, 23, 12, 0, 0, 0, time.UTC)

// halted lists instruments the issuer had halted when their mint was captured.
// Halt state is not in the mint, so it is recorded beside the fixtures' notes.
var halted = map[string]bool{"TQQQx": true, "CRDAx": true}

// depthSizes are the sizes depth was captured at.
var depthSizes = []int64{100, 1000, 10000}

// decide runs the engine's own decision on the captured bytes, and returns the
// depth curve it was made against so the page can show its working.
func decide(f fixture, mint *registry.Mint, asOf time.Time) (policy.Result, []DepthRow, int64, policy.Result, error) {
	input, err := policy.FromRegistry(f.Symbol, f.Address, "certificate", mint, asOf, f.Slot, halted[f.Symbol], false)
	if err != nil {
		return policy.Result{}, nil, 0, policy.Result{}, err
	}

	curve, err := liquidity.LoadCurve(filepath.Join("shared", "fixtures", "jupiter"), f.Symbol, f.Address,
		int32(mint.Decimals), depthSizes, asOf)
	if err != nil {
		return policy.Result{}, nil, 0, policy.Result{}, err
	}
	policyDoc := policy.Default()
	if input.Depth, err = policy.DepthFromCurve(curve, policyDoc.DepthReferenceUSDC); err != nil {
		return policy.Result{}, nil, 0, policy.Result{}, err
	}

	result, err := policy.Evaluate(policyDoc, input)
	if err != nil {
		return policy.Result{}, nil, 0, policy.Result{}, err
	}
	measured := make([]policy.DepthFacts, 0, len(depthSizes))
	for _, size := range depthSizes {
		facts, factsErr := policy.DepthFromCurve(curve, size)
		if factsErr != nil {
			return policy.Result{}, nil, 0, policy.Result{}, factsErr
		}
		measured = append(measured, facts)
	}
	capacityUSDC, capacityDecision, err := policy.Capacity(policyDoc, input, measured)
	if err != nil {
		return policy.Result{}, nil, 0, policy.Result{}, err
	}

	rows := make([]DepthRow, len(curve.Points))
	for i, p := range curve.Points {
		row := DepthRow{SizeUSDC: depthSizes[i], Availability: string(p.Observation.Availability), Code: p.Observation.Code, Shortfall: "no observation"}
		if p.ShortfallBps != nil {
			row.Shortfall = basisPoints(*p.ShortfallBps)
		}
		if q := p.Observation.Quote; q != nil {
			row.Venues = venueList(q.Hops)
		}
		rows[i] = row
	}
	return result, rows, capacityUSDC, capacityDecision, nil
}

func venueList(hops []liquidity.Hop) string {
	seen := map[string]bool{}
	var names []string
	for _, h := range hops {
		if !seen[h.Venue] {
			seen[h.Venue] = true
			names = append(names, h.Venue)
		}
	}
	return strings.Join(names, ", ")
}

type survey struct {
	CapturedAt            time.Time        `json:"captured_at"`
	Slot                  uint64           `json:"slot"`
	MintsDecoded          int              `json:"mints_decoded"`
	WithScaledUIAmount    int              `json:"with_scaled_ui_amount"`
	StaleMultiplier       int              `json:"stale_multiplier_field"`
	PendingActivation     int              `json:"activation_scheduled_not_yet_effective"`
	HaltedByIssuer        int              `json:"halted_by_issuer"`
	WithPermanentDelegate int              `json:"with_permanent_delegate"`
	WithFreezeAuthority   int              `json:"with_freeze_authority"`
	WithDisabledHook      int              `json:"with_transfer_hook_initialized_disabled"`
	WithActiveHook        int              `json:"with_transfer_hook_active"`
	DecodeFailures        []string         `json:"decode_failures"`
	Stale                 []staleSurveyRow `json:"stale"`
}

type staleSurveyRow struct {
	Symbol      string `json:"symbol"`
	Underlying  string `json:"underlying"`
	Mint        string `json:"mint"`
	NaiveValue  string `json:"naive_value"`
	LiveValue   string `json:"live_value"`
	EffectiveAt string `json:"effective_at"`
}

type page struct {
	Title       string
	Nav         string
	MarkAsset   string
	Generated   string
	Instruments []Instrument
	Survey      *survey
	BigSplits   []splitRow
	StalePct    string
	BatchJSON   template.JS
	BatchCount  int
	BatchRoot   string
	Anchor      *batchAnchor
	Demo        *Transcript
	Devnet      *Transcript
	Cost        *CostTable
	Proof       *receipt.Proof
	Lots        []Lot
	// Shared is the issuer-power sentences every lot carries, stated once.
	Shared []string
	// ReferenceUSDC is the size the admission policy judges depth at.
	ReferenceUSDC int64
	Lot           *Lot
	LotReasons    []policy.Reason
	StaleRows     []staleSurveyRow
	EvidenceLinks []evidenceLink
	EvidencePage  int
	EvidencePages int
}

type evidenceLink struct {
	Label   int
	Href    string
	Current bool
}

const evidenceRowsPerPage = 40

type splitRow struct {
	Symbol, Naive, Live, Since string
}

func main() {
	out := flag.String("out", filepath.Join("dist", "explorer"), "output directory")
	addr := flag.String("serve", "", "generate, then serve on this address, for example :8080")
	admissions := flag.String("admissions", "", "also write every instrument's decision as JSON to this path, for example shared/evidence/admissions.json")
	flag.Parse()

	instruments := loadInstruments()
	if *admissions != "" {
		if err := writeAdmissions(*admissions, instruments); err != nil {
			fail(err)
		}
		fmt.Printf("  %s\n", *admissions)
	}
	surveyData := loadSurvey()
	batch := loadBatch(filepath.Join("shared", "evidence", "anchors"))
	demo := loadTranscript("transcript.json")
	devnet := loadTranscript("transcript-devnet.json")

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
		MarkAsset:   versionedAsset("seametry-mark.svg", filepath.Join("clients", "web", "public", "logo.svg")),
		Generated:   time.Now().UTC().Format("2 January 2006, 15:04 UTC"),
		Instruments: instruments,
		Survey:      surveyData,
		StalePct:    stalePct,
		BigSplits:   splits,
		BatchJSON:   template.JS(batch.JSON),
		BatchCount:  batch.Count,
		BatchRoot:   batch.Root,
		Anchor:      batch.Anchor,
		Demo:        demo,
		Devnet:      devnet,
		Cost:        costTable(demo),
	}
	base.ReferenceUSDC = policy.Default().DepthReferenceUSDC
	base.Lots = buildLots(instruments, policy.Default())
	base.Shared = sharedSentences(instruments)

	if err := os.MkdirAll(*out, 0o755); err != nil {
		fail(err)
	}

	tmpl := loadTemplates()

	// Verification opens the site: it is what a stranger arrives to do
	// (EXPLORER.md section 2), and the one thing here that happens on their
	// own machine the moment they ask.
	pages := []struct{ file, tmpl, title, nav string }{
		{"index.html", "verify.html", "Verify a hallmark", "verify"},
		{"catalogue.html", "catalogue.html", "Catalogue", "catalogue"},
		{"hall.html", "hall.html", "The Hall", "hall"},
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
	if n := writeEvidencePages(*out, tmpl, base); n > 0 {
		fmt.Printf("  %d evidence pages\n", n)
	}

	if n := writeHallmarkPages(*out, tmpl, base, batch.Proofs); n > 0 {
		fmt.Printf("  %d hallmark pages (hallmark-<serial>.html)\n", n)
	}
	if n := writeLotPages(*out, tmpl, base); n > 0 {
		fmt.Printf("  %d lot pages (lot-<symbol>.html)\n", n)
	}
	for _, ink := range []string{"light", "dark"} {
		if err := os.WriteFile(filepath.Join(*out, "pillar-"+ink+".svg"), []byte(pillarSVG(ink)), 0o644); err != nil {
			fail(err)
		}
	}

	// Static assets, plus the fonts if they have been fetched.
	// The generated design tokens travel with the page. They are the only
	// place a colour, size or duration is stated, and they are generated from
	// the design system source rather than written here.
	copyFile(filepath.Join("clients", "packages", "ui", "src", "generated", "tokens.css"), filepath.Join(*out, "tokens.css"))
	copyFile(filepath.Join("clients", "web", "public", "logo.svg"), filepath.Join(*out, "seametry-mark.svg"))
	copyEmbedded(*out, "assets/explorer.css", "explorer.css")
	copyEmbedded(*out, "assets/theme.js", "theme.js")
	copyEmbedded(*out, "assets/verify.js", "verify.js")
	// The sealed batch travels as its own script rather than inline, so the
	// content security policy can refuse inline script entirely.
	if err := os.WriteFile(filepath.Join(*out, "batch.js"),
		[]byte("window.__SEAMETRY_BATCH__ = "+batch.JSON+";\n"), 0o644); err != nil {
		fail(err)
	}
	copyFonts(*out)
	writeHostConfig(*out)

	fmt.Printf("\n%d instruments, %d sealed receipts", len(instruments), batch.Count)
	if surveyData != nil {
		fmt.Printf(", %d mints surveyed", surveyData.MintsDecoded)
	}
	fmt.Printf("\n\nopen %s\n", filepath.Join(*out, "index.html"))

	if *addr != "" {
		serve(*out, *addr)
	}
}

func versionedAsset(name, source string) string {
	data, err := os.ReadFile(source)
	if err != nil {
		fail(fmt.Errorf("read %s for asset revision: %w", source, err))
	}
	sum := sha256.Sum256(data)
	return fmt.Sprintf("%s?v=%x", name, sum[:8])
}

func evidenceFile(n int) string {
	if n == 1 {
		return "evidence.html"
	}
	return fmt.Sprintf("evidence-%d.html", n)
}

func writeEvidencePages(out string, tmpl *template.Template, base page) int {
	count := 0
	if base.Survey != nil {
		count = len(base.Survey.Stale)
	}
	pageCount := (count + evidenceRowsPerPage - 1) / evidenceRowsPerPage
	if pageCount == 0 {
		pageCount = 1
	}

	for pageNumber := 1; pageNumber <= pageCount; pageNumber++ {
		data := base
		data.Title = "Evidence"
		data.Nav = "evidence"
		data.EvidencePage = pageNumber
		data.EvidencePages = pageCount
		if base.Survey != nil {
			start := (pageNumber - 1) * evidenceRowsPerPage
			end := start + evidenceRowsPerPage
			if end > count {
				end = count
			}
			data.StaleRows = base.Survey.Stale[start:end]
		}
		for i := 1; i <= pageCount; i++ {
			data.EvidenceLinks = append(data.EvidenceLinks, evidenceLink{
				Label: i, Href: evidenceFile(i), Current: i == pageNumber,
			})
		}

		file, err := os.Create(filepath.Join(out, evidenceFile(pageNumber)))
		if err != nil {
			fail(err)
		}
		if err := tmpl.ExecuteTemplate(file, "evidence.html", data); err != nil {
			file.Close()
			fail(err)
		}
		file.Close()
	}
	return pageCount
}

func loadTemplates() *template.Template {
	return template.Must(template.New("").Funcs(template.FuncMap{
		"short": func(s string) string {
			if len(s) <= 18 {
				return s
			}
			return s[:8] + "…" + s[len(s)-6:]
		},
		"commas": commas,
		"grades": distinctGrades,
		"trunc": func(n int, s string) string {
			if len(s) <= n {
				return s
			}
			return s[:n] + "…"
		},
		"lot":   lotFile,
		"lower": strings.ToLower,
		// A size in whole USDC, never negative: a depth reference size.
		"usdc": func(n int64) string { return commas(uint64(n)) },
	}).ParseFS(templates, "templates/*.html"))
}

func loadInstruments() []Instrument {
	dir := filepath.Join("shared", "fixtures", "mainnet")
	entries, err := os.ReadDir(dir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "explorer: no fixtures (%v); run: go run ./server/cmd/capture\n", err)
		return nil
	}
	asOf := decisionsAsOf

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
			Symbol: f.Symbol, Issuer: f.Issuer, Address: f.Address,
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
		result, depth, capacityUSDC, capacityDecision, err := decide(f, mint, asOf)
		if err != nil {
			fail(fmt.Errorf("%s: %w", f.Symbol, err))
		}
		inst.Decision = string(result.Decision)
		inst.Reasons = result.Reasons
		inst.PolicyVersion = result.PolicyVersion
		inst.InputDigest = result.InputDigest
		inst.Depth = depth
		inst.CapacityUSDC = capacityUSDC
		inst.CapacityDecision = capacityDecision
		if inst.Admission, err = admissionFor(f, mint, prerogatives, result, capacityUSDC, capacityDecision); err != nil {
			fail(fmt.Errorf("%s: %w", f.Symbol, err))
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
	matches, _ := filepath.Glob(filepath.Join("shared", "evidence", "multiplier-staleness-*.json"))
	if len(matches) == 0 {
		fmt.Fprintln(os.Stderr, "explorer: no survey yet; run: go run ./server/cmd/survey")
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

// sealedBatch is the sealed batch three ways: the raw JSON that ships to the
// browser as batch.js (proofs and anchor, never the private bodies), the
// count, root and anchor for the pages that only need those facts, and the
// proofs parsed into receipt.Proof so hallmark.html can be generated once per
// serial without round-tripping through JSON a second time.
type sealedBatch struct {
	JSON   string
	Count  int
	Root   string
	Proofs []receipt.Proof
	Anchor *batchAnchor
}

// batchAnchor mirrors server/cmd/seametry's anchorEvidence, which writes
// shared/evidence/anchors. It is duplicated rather than imported, as
// replay.go duplicates capture's fixture: neither command owns a package
// boundary worth creating for one struct, and DisallowUnknownFields on the
// decode below is the drift guard.
type batchAnchor struct {
	Root        string    `json:"root"`
	Memo        string    `json:"memo"`
	Cluster     string    `json:"cluster"`
	Transaction string    `json:"transaction"`
	Key         string    `json:"key"`
	Slot        uint64    `json:"slot"`
	Commitment  string    `json:"commitment"`
	AnchoredAt  time.Time `json:"anchored_at"`
}

// loadAnchor reads the anchor evidence for root, if the root has been
// anchored. A file that exists but does not anchor this root, finalized on
// devnet, fails the build: publishing it would link visitors to a
// transaction that does not say what the page claims it says.
func loadAnchor(dir, root string) (*batchAnchor, error) {
	path := filepath.Join(dir, root+".json")
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var a batchAnchor
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&a); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	switch {
	case a.Root != root:
		return nil, fmt.Errorf("%s names root %s, but is filed under %s", path, a.Root, root)
	case a.Memo != string(receipt.AnchorMemo(root)):
		return nil, fmt.Errorf("%s: memo %q is not the anchor memo for %s, %q", path, a.Memo, root, receipt.AnchorMemo(root))
	case a.Cluster != "devnet" || a.Commitment != "finalized":
		return nil, fmt.Errorf("%s: anchored on %s at %s commitment; the page links devnet and claims finalized", path, a.Cluster, a.Commitment)
	case a.Transaction == "" || a.Key == "":
		return nil, fmt.Errorf("%s: names no transaction or no key", path)
	}
	return &a, nil
}

func loadBatch(anchorDir string) sealedBatch {
	empty := sealedBatch{JSON: "null"}
	raw, err := os.ReadFile(filepath.Join("shared", "evidence", "demo-batch", "batch.json"))
	if err != nil {
		fmt.Fprintln(os.Stderr, "explorer: no sealed batch; run: go run ./server/cmd/seal")
		return empty
	}
	var parsed struct {
		Root   string            `json:"root"`
		Count  int               `json:"count"`
		Proofs []json.RawMessage `json:"proofs"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return empty
	}
	proofs := make([]receipt.Proof, 0, len(parsed.Proofs))
	for _, p := range parsed.Proofs {
		var proof receipt.Proof
		if err := json.Unmarshal(p, &proof); err != nil {
			fail(fmt.Errorf("loadBatch: proof did not parse as receipt.Proof: %w", err))
		}
		proofs = append(proofs, proof)
	}
	anchor, err := loadAnchor(anchorDir, parsed.Root)
	if err != nil {
		fail(err)
	}
	// Only the proofs and the anchor reach the page. The private bodies in that
	// file exist for the cross-implementation check and have no business in a
	// public surface.
	public := map[string]any{"root": parsed.Root, "proofs": parsed.Proofs, "anchor": anchor, "anchor_memo_prefix": receipt.AnchorMemoPrefix}
	encoded, err := json.Marshal(public)
	if err != nil {
		return empty
	}
	return sealedBatch{JSON: string(encoded), Count: parsed.Count, Root: parsed.Root, Proofs: proofs, Anchor: anchor}
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
	for _, name := range []string{"Sentient-Variable.woff2", "Switzer-Variable.woff2", "FragmentMono-Regular.woff2"} {
		data, err := os.ReadFile(filepath.Join("clients", "web", "fonts", name))
		if err != nil {
			continue
		}
		if err := os.WriteFile(filepath.Join(dir, name), data, 0o644); err != nil {
			fail(err)
		}
		copied++
	}
	if copied < 3 {
		fmt.Fprintln(os.Stderr, "explorer: fonts not found, the page will fall back to system faces; run: npm run fonts --workspace=clients/web")
	}
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, "explorer:", err)
	os.Exit(1)
}

// copyFile copies a generated artifact into the output. It fails loudly when
// the source is missing, because a page silently rendered without its tokens
// looks like a styling bug rather than a missing build step.
func copyFile(from, to string) {
	data, err := os.ReadFile(from)
	if err != nil {
		fail(fmt.Errorf("%s is missing; regenerate it with:\n"+
			"  node .claude/skills/seametry-design/scripts/build-tokens.mjs "+
			".claude/skills/seametry-design/assets/tokens/seametry.tokens.json clients/packages/ui/src/generated\n%w", from, err))
	}
	if err := os.WriteFile(to, data, 0o644); err != nil {
		fail(err)
	}
}
