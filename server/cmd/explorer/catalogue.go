package main

import (
	"html/template"
	"os"
	"path/filepath"

	"github.com/BeyndtechArc/Seametry/server/internal/policy"
)

// writeLotPages writes one page per instrument: "one object per view"
// (foundations.md section 4). All seven lots on one page stacked some sixty
// cards into a single scroll, which is the overload this replaces.
func writeLotPages(out string, tmpl *template.Template, base page) int {
	for i := range base.Lots {
		data := base
		lot := base.Lots[i]
		data.Title = lot.Instrument.Symbol
		// A lot is a child of the catalogue, not the catalogue itself;
		// marking that nav item current would claim otherwise.
		data.Nav = ""
		data.Lot = &lot
		data.LotReasons = lotReasons(lot.Instrument)

		file, err := os.Create(filepath.Join(out, lotFile(lot.Instrument.Symbol)))
		if err != nil {
			fail(err)
		}
		if err := tmpl.ExecuteTemplate(file, "lot.html", data); err != nil {
			fail(err)
		}
		file.Close()
	}
	return len(base.Lots)
}

// Lot is one instrument as the catalogue and its own page present it: what
// the policy decided, the sentence that decided it, and the one depth figure
// the decision turned on.
type Lot struct {
	Number     int
	Instrument Instrument
	// Admitted is every decision short of BLOCK. WARN admits: policy.Warn is
	// "a condition a holder should be told about, and which they, not
	// Seametry, decide what to do about", not a refusal.
	Admitted bool
	// Reason is the first blocking reason in a few words; the lot page's
	// Decision section carries the policy's full sentence. Empty when admitted.
	Reason string
	// Shortfall is the depth at the policy's reference size, written out:
	// "12 bps", or "No route" when nothing priced.
	Shortfall string
	// Own lists the issuer powers this instrument has that the others do not;
	// the ones every instrument shares are stated once, above the table.
	Own []string
}

func lotFile(symbol string) string { return "lot-" + symbol + ".html" }

// buildLots numbers instruments in catalogue order and derives what each row
// shows. A catalogue's numbers are order, not rank (foundations.md section 4).
func buildLots(instruments []Instrument, doc policy.Document) []Lot {
	shared := sharedSentences(instruments)
	lots := make([]Lot, len(instruments))
	for i, inst := range instruments {
		lot := Lot{Number: i + 1, Instrument: inst, Admitted: inst.Decision != string(policy.Block)}
		for _, r := range inst.Reasons {
			if r.Severity == policy.Block {
				lot.Reason = reasonInWords(r, doc.DepthCeilingBps)
				break
			}
		}
		lot.Shortfall = shortfallAt(inst.Depth, doc.DepthReferenceUSDC)
		for _, s := range inst.Sentences {
			if !contains(shared, s) {
				lot.Own = append(lot.Own, s)
			}
		}
		lots[i] = lot
	}
	return lots
}

// sharedSentences returns the issuer-power sentences every instrument carries,
// in the first instrument's order. Stated once, they stop the catalogue
// repeating the same six facts on every row, which hid the one column that
// actually differs: whether each can be traded at size.
func sharedSentences(instruments []Instrument) []string {
	if len(instruments) == 0 {
		return nil
	}
	var shared []string
	for _, s := range instruments[0].Sentences {
		inAll := true
		for _, other := range instruments[1:] {
			if !contains(other.Sentences, s) {
				inAll = false
				break
			}
		}
		if inAll {
			shared = append(shared, s)
		}
	}
	return shared
}

// shortfallAt writes the depth row at size in words. An absent route is a
// fact about the market, never a zero.
func shortfallAt(depth []DepthRow, size int64) string {
	for _, d := range depth {
		if d.SizeUSDC != size {
			continue
		}
		if d.Availability != "available" {
			return "No route"
		}
		return d.Shortfall
	}
	return "No observation"
}

// basisPoints writes a shortfall with thousands separators (voice.md) and, when
// a larger size somehow priced better, the minus sign U+2212 rather than a hyphen.
func basisPoints(n int64) string {
	if n < 0 {
		return "−" + commas(uint64(-n)) + " bps"
	}
	return commas(uint64(n)) + " bps"
}

// reasonInWords is a blocking reason short enough to sit under a stamp in a
// table row (components.md, Decision row: "first reason code in words"). The
// policy's full sentence stays on the lot page; repeating it on every row
// restated the figure already in the column beside it.
func reasonInWords(r policy.Reason, ceilingBps int64) string {
	switch r.Code {
	case policy.CodeDepthAboveCeiling:
		return "Shortfall above the " + basisPoints(ceilingBps) + " ceiling"
	case policy.CodeNoRoute:
		return "No route to buy at this size"
	case policy.CodeNotTradable:
		return "The aggregator will not trade it"
	}
	return r.Fact
}

func contains(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}

// lotReasons is the decision's reasons minus the ones the condition report
// already states word for word, so the lot page never prints a sentence twice.
func lotReasons(inst Instrument) []policy.Reason {
	var out []policy.Reason
	for _, r := range inst.Reasons {
		if !contains(inst.Sentences, r.Fact) {
			out = append(out, r)
		}
	}
	return out
}
