package main

import (
	"fmt"
	"math"
	"reflect"
	"strings"
	"testing"

	"github.com/BeyndtechArc/Seametry/server/internal/policy"
)

func TestSharedSentencesKeepsOnlyWhatEveryInstrumentCarries(t *testing.T) {
	insts := []Instrument{
		{Sentences: []string{"freeze", "pause", "seize"}},
		{Sentences: []string{"seize", "freeze"}},
		{Sentences: []string{"freeze", "seize", "hook"}},
	}
	want := []string{"freeze", "seize"}
	if got := sharedSentences(insts); !reflect.DeepEqual(got, want) {
		t.Errorf("sharedSentences = %v, want %v, in the first instrument's order", got, want)
	}
	if got := sharedSentences(nil); got != nil {
		t.Errorf("sharedSentences(nil) = %v, want nil", got)
	}
}

func TestBuildLotsSaysWhyARefusalWasRefusedInWords(t *testing.T) {
	doc := policy.Default()
	insts := []Instrument{
		{Symbol: "OKx", Decision: string(policy.Warn), Sentences: []string{"freeze"},
			Depth: []DepthRow{{SizeUSDC: doc.DepthReferenceUSDC, Availability: "available", Shortfall: "12 bps"}}},
		{Symbol: "THINx", Decision: string(policy.Block), Sentences: []string{"freeze", "pause"},
			Reasons: []policy.Reason{
				{Code: "ISSUER_CAN_FREEZE", Severity: policy.Warn, Fact: "freeze"},
				{Code: policy.CodeDepthAboveCeiling, Severity: policy.Block, Fact: "a long policy sentence"},
			},
			Depth: []DepthRow{{SizeUSDC: doc.DepthReferenceUSDC, Availability: "available", Shortfall: "232 bps"}}},
		{Symbol: "NONEx", Decision: string(policy.Block), Sentences: []string{"freeze"},
			Reasons: []policy.Reason{{Code: policy.CodeNoRoute, Severity: policy.Block, Fact: "No route"}},
			Depth:   []DepthRow{{SizeUSDC: doc.DepthReferenceUSDC, Availability: "no_route"}}},
	}
	lots := buildLots(insts, doc)

	if !lots[0].Admitted || lots[0].Reason != "" {
		t.Errorf("a WARN decision is admitted with no refusal reason, got admitted=%v reason=%q", lots[0].Admitted, lots[0].Reason)
	}
	if lots[1].Admitted {
		t.Error("a BLOCK decision must be refused")
	}
	if want := "Shortfall above the " + basisPoints(doc.DepthCeilingBps) + " ceiling"; lots[1].Reason != want {
		t.Errorf("refusal reason = %q, want the short words %q, never the full policy sentence", lots[1].Reason, want)
	}
	if lots[2].Shortfall != "No route" {
		t.Errorf("an unavailable route reads %q, want %q: an absent route is a fact, never a zero", lots[2].Shortfall, "No route")
	}
	if !reflect.DeepEqual(lots[1].Own, []string{"pause"}) {
		t.Errorf("Own = %v, want only the power the others do not share", lots[1].Own)
	}
	for i, l := range lots {
		if l.Number != i+1 {
			t.Errorf("lot %d numbered %d; numbers are catalogue order", i, l.Number)
		}
	}
}

func TestLotReasonsNeverRepeatAConditionSentence(t *testing.T) {
	inst := Instrument{
		Sentences: []string{"The issuer can freeze this where it sits."},
		Reasons: []policy.Reason{
			{Fact: "The issuer can freeze this where it sits."},
			{Fact: "Buying 1000 USDC realises a worse rate."},
		},
	}
	got := lotReasons(inst)
	if len(got) != 1 || got[0].Fact != "Buying 1000 USDC realises a worse rate." {
		t.Errorf("lotReasons = %v, want only the reason the condition report does not already state", got)
	}
}

func TestBasisPointsSeparatesThousandsAndUsesAMinusSign(t *testing.T) {
	for n, want := range map[int64]string{0: "0 bps", 232: "232 bps", 8237: "8,237 bps", -15: "−15 bps"} {
		if got := basisPoints(n); got != want {
			t.Errorf("basisPoints(%d) = %q, want %q", n, got, want)
		}
	}
}

func TestPillarIsDeterministicAndDiffersByInk(t *testing.T) {
	light, dark := pillarSVG("light"), pillarSVG("dark")
	if light != pillarSVG("light") {
		t.Error("pillarSVG is not deterministic; two builds of the same commit would ship different files")
	}
	if light == dark {
		t.Error("the light and dark inks produced the same drawing; light mode would be shaded backwards")
	}
	for name, svg := range map[string]string{"light": light, "dark": dark} {
		if !strings.HasPrefix(svg, "<svg ") || !strings.HasSuffix(svg, "</svg>") {
			t.Errorf("%s ink is not a complete svg element", name)
		}
		// Shaft lines are the only filled ribbons that run down the plate; all
		// hatching runs across it. The 8 arrises between flutes are always cut:
		// a constant 0.45 hairline, above the 0.08 threshold, whatever the
		// light. Two cheaper checks passed with the whole shaft deleted: a
		// total path count (the capital and base alone exceed any floor) and
		// counting 31-sample ribbons (inked hatching runs hit 31 samples too).
		const arrises, contours = 8, 2
		shaft := 0
		for _, p := range strings.Split(svg, "<path")[1:] {
			if strings.Contains(p, "stroke=") {
				continue
			}
			if runsDown(t, p) {
				shaft++
			}
		}
		if shaft < arrises {
			t.Errorf("%s ink has %d shaft lines, fewer than the %d flute arrises always cut", name, shaft, arrises)
		}
		if n := strings.Count(svg, `stroke-width="0.5"`); n != contours {
			t.Errorf("%s ink has %d contour lines, want %d: the silhouette is closed on both sides", name, n, contours)
		}
	}
}

// runsDown reports whether a ribbon's centre line travels further down than
// across, reading one side of its outline: the first point to the middle one.
func runsDown(t *testing.T, path string) bool {
	t.Helper()
	d := path[strings.Index(path, `d="M`)+4:]
	pts := strings.Split(d[:strings.Index(d, `"`)], "L")
	first, mid := point(t, pts[0]), point(t, strings.TrimSuffix(pts[len(pts)/2-1], "Z"))
	return math.Abs(mid[1]-first[1]) > math.Abs(mid[0]-first[0])
}

func point(t *testing.T, s string) [2]float64 {
	t.Helper()
	var p [2]float64
	if _, err := fmt.Sscanf(s, "%f,%f", &p[0], &p[1]); err != nil {
		t.Fatalf("path point %q is not x,y: %v", s, err)
	}
	return p
}
