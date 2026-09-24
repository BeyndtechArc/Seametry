// Package policy decides whether an instrument may enter a basket, and says
// why in words a holder can check.
//
// Three properties make this package what it is.
//
// It is a pure function. No clock, no network, no database. The same inputs
// produce the same decision on every machine and in every year, which is what
// lets a decision be recorded in a receipt and re-examined later.
//
// Policy is data, not code. Thresholds live in a versioned Document that is
// loaded at runtime, every decision records the version that produced it, and
// a consumer who wants different thresholds receives a file rather than a fork.
//
// It states conditions and never recommends. A decision classifies what is
// true about an instrument. It does not express a view on direction, size,
// timing, or suitability, and the vocabulary in docs/ENGINEERING_STANDARD.md
// section 16 applies to every string here.
//
// Bound by spec/policy/golden/decisions.json.
package policy

import (
	"encoding/hex"
	"fmt"
	"sort"
	"time"

	"github.com/BeyndtechArc/Seametry/internal/amount"
	"github.com/BeyndtechArc/Seametry/internal/canonical"
	"github.com/BeyndtechArc/Seametry/internal/liquidity"
	"github.com/BeyndtechArc/Seametry/internal/registry"
)

// Decision is the outcome. Three values, ordered by severity.
type Decision string

const (
	// Allow means nothing in the policy objects to this instrument.
	Allow Decision = "ALLOW"
	// Warn means a condition holds that a holder should be told about, and
	// which they, not Seametry, decide what to do about.
	Warn Decision = "WARN"
	// Block means the instrument is refused. A block is never advice; it is a
	// statement that a stated rule is not met.
	Block Decision = "BLOCK"
)

func (d Decision) severity() int {
	switch d {
	case Block:
		return 2
	case Warn:
		return 1
	}
	return 0
}

// Code identifies a reason permanently.
//
// A code's meaning never changes. When the meaning would change, the code is
// retired and a new one is added, because a receipt issued last year cites
// these and must still mean what it said.
type Code string

const (
	CodeUngraded             Code = "GRADE_UNGRADED"
	CodePaused               Code = "ISSUER_PAUSED_NOW"
	CodeNonTransferable      Code = "NON_TRANSFERABLE"
	CodeFrozenByDefault      Code = "NEW_ACCOUNTS_START_FROZEN"
	CodeActiveHookUnknown    Code = "TRANSFER_HOOK_ACTIVE_UNRECOGNISED"
	CodeQuarantined          Code = "CORPORATE_ACTION_MISMATCH"
	CodeMultiplierUnresolved Code = "MULTIPLIER_UNRESOLVED"

	CodeNoRoute           Code = "NO_ROUTE_FOUND"
	CodeNotTradable       Code = "TOKEN_NOT_TRADABLE_BY_AGGREGATOR"
	CodeRefusalUnknown    Code = "ROUTE_REFUSAL_UNRECOGNISED"
	CodeDepthAboveCeiling Code = "DEPTH_ABOVE_CEILING"
	CodeDepthNotObserved  Code = "DEPTH_NOT_OBSERVED"

	CodeUnknownExtension  Code = "UNKNOWN_EXTENSION_PRESENT"
	CodeHaltedByIssuer    Code = "HALTED_BY_ISSUER"
	CodePermanentDelegate Code = "ISSUER_CAN_SEIZE"
	CodeFreezeAuthority   Code = "ISSUER_CAN_FREEZE"
	CodePausable          Code = "ISSUER_CAN_PAUSE"
	CodeHookCanBeEnabled  Code = "TRANSFER_HOOK_CAN_BE_ENABLED"
	// Two distinct powers, deliberately two codes. Changing the apparent
	// quantity of an existing holding and creating new units are different
	// acts with different consequences, and one code covering both would make
	// a receipt citing it ambiguous about which happened.
	CodeMultiplierAuthority Code = "ISSUER_CAN_CHANGE_APPARENT_QUANTITY"
	CodeSupplyMutable       Code = "ISSUER_CAN_MINT_MORE"
	CodeActivationPending   Code = "ACTIVATION_SCHEDULED"
	CodeNaiveReaderWrong    Code = "OBVIOUS_MULTIPLIER_FIELD_IS_STALE"
)

// Reason is one finding, with the severity it carries on its own.
type Reason struct {
	Code     Code     `json:"code"`
	Severity Decision `json:"severity"`
	// Fact is the finding as a plain sentence. It describes; it never advises,
	// and it reads the same for every issuer holding the same control.
	Fact string `json:"fact"`
}

// Document is the policy, as versioned data.
type Document struct {
	Version string `json:"version"`

	// AcceptedGrades lists the legal shapes a basket will admit. A grade
	// absent from this list is refused, which is how ungraded blocks by
	// default without a special case.
	AcceptedGrades []string `json:"accepted_grades"`

	// AllowedHookPrograms lists transfer hook programs that have been read and
	// accepted. A hook outside it is refused rather than trusted, because an
	// unrecognised hook can reject a transfer for reasons nobody here has read.
	AllowedHookPrograms []string `json:"allowed_hook_programs"`

	// BlockOnUnknownExtension decides whether an extension this build does not
	// decode refuses the instrument or merely warns. It defaults to warning,
	// on the view that naming an unknown is more useful than hiding behind it,
	// but an operator holding other people's money may reasonably disagree.
	BlockOnUnknownExtension bool `json:"block_on_unknown_extension"`

	// BlockOnIssuerHalt decides whether an issuer halt refuses the instrument.
	BlockOnIssuerHalt bool `json:"block_on_issuer_halt"`

	// DepthReferenceUSDC is the notional size, in whole USDC, at which
	// executable depth is judged.
	DepthReferenceUSDC int64 `json:"depth_reference_usdc"`

	// DepthCeilingBps is the largest shortfall, in basis points, that the rate
	// at the reference size may show against the smallest size that priced.
	//
	// ASSUMPTION, not a finding. 100 basis points was chosen as a round figure
	// that admits the one deep instrument in the first survey (12 bps at 1,000
	// USDC) and refuses those losing more than two percent. Nothing here
	// validates it as the right level for a basket, and it should be revisited
	// with evidence about what constituent depth an alloy actually needs.
	DepthCeilingBps int64 `json:"depth_ceiling_bps"`
}

// Default is the policy shipped with this build.
func Default() Document {
	return Document{
		Version:                 "policy-2026.09.2",
		AcceptedGrades:          []string{"entitlement", "certificate", "interest"},
		AllowedHookPrograms:     []string{},
		BlockOnUnknownExtension: false,
		BlockOnIssuerHalt:       false,
		DepthReferenceUSDC:      1000,
		DepthCeilingBps:         100,
	}
}

// Input is everything a decision is made from. Every field is an observation,
// and the decision is a function of exactly these.
type Input struct {
	Symbol string `json:"symbol"`
	Mint   string `json:"mint"`
	Grade  string `json:"grade"`

	// AsOf is the instant the decision is made at, passed in rather than read,
	// so the same inputs always give the same answer.
	AsOf time.Time `json:"as_of"`

	// ObservedAtSlot records which chain state this was decoded from. It does
	// not affect the decision, and it is part of the digest so that a decision
	// is bound to the state it was made against.
	ObservedAtSlot uint64 `json:"observed_at_slot"`

	HaltedByIssuer bool `json:"halted_by_issuer"`
	Quarantined    bool `json:"quarantined"`

	Depth             DepthFacts       `json:"depth"`
	Prerogatives      PrerogativeFacts `json:"prerogatives"`
	MultiplierState   MultiplierFacts  `json:"multiplier"`
	UnknownExtensions []string         `json:"unknown_extensions"`
}

// PrerogativeFacts is the decoded issuer power set, flattened for the decision.
type PrerogativeFacts struct {
	HasFreezeAuthority   bool   `json:"has_freeze_authority"`
	HasPermanentDelegate bool   `json:"has_permanent_delegate"`
	HasMintAuthority     bool   `json:"has_mint_authority"`
	CanChangeMultiplier  bool   `json:"can_change_multiplier"`
	Pausable             bool   `json:"pausable"`
	PausedNow            bool   `json:"paused_now"`
	NonTransferable      bool   `json:"non_transferable"`
	FreezesNewAccounts   bool   `json:"freezes_new_accounts"`
	TransferHookState    string `json:"transfer_hook_state"`
	TransferHookProgram  string `json:"transfer_hook_program"`
}

// DepthFacts is what the aggregator said about executing at one size.
type DepthFacts struct {
	// Observed is false when depth was not measured at all, which is different
	// from measured and found absent.
	Observed bool `json:"observed"`

	// SizeUSDC is the size these facts describe, in whole USDC.
	SizeUSDC int64 `json:"size_usdc"`

	// Availability is one of the liquidity package's values, as a string.
	Availability string `json:"availability"`

	// ProviderCode is the aggregator's own refusal code, verbatim.
	ProviderCode string `json:"provider_code"`

	// ShortfallBps is measured against BaselineSizeUSDC, the smallest size that
	// priced. A shortfall against an unstated baseline would be a bare number.
	ShortfallBps     *int64 `json:"shortfall_bps"`
	BaselineSizeUSDC int64  `json:"baseline_size_usdc"`
}

// MultiplierFacts is what the resolver found.
type MultiplierFacts struct {
	Present           bool   `json:"present"`
	Resolved          bool   `json:"resolved"`
	NaiveIsStale      bool   `json:"naive_is_stale"`
	ActivationPending bool   `json:"activation_pending"`
	LiveValue         string `json:"live_value"`
	NaiveValue        string `json:"naive_value"`
}

// Result is the decision and everything needed to reproduce it.
type Result struct {
	Decision      Decision `json:"decision"`
	Reasons       []Reason `json:"reasons"`
	PolicyVersion string   `json:"policy_version"`
	// InputDigest is SHA-256 over the canonical form of the input. Identical
	// inputs produce byte identical digests on every machine, which is what
	// makes a recorded decision checkable rather than merely stored.
	InputDigest string `json:"input_digest"`
}

// Evaluate decides. It is pure: no clock, no I/O, no package state.
func Evaluate(doc Document, in Input) (Result, error) {
	digest, err := canonical.Digest(in)
	if err != nil {
		return Result{}, fmt.Errorf("policy: %w", err)
	}

	// Initialized rather than left nil, so a clean instrument serializes its
	// reasons as an empty list. A consumer should never have to tell null
	// apart from absent to learn that nothing was found.
	reasons := []Reason{}
	add := func(code Code, severity Decision, fact string) {
		reasons = append(reasons, Reason{Code: code, Severity: severity, Fact: fact})
	}

	// Blocking conditions: a stated rule is not met.
	if !contains(doc.AcceptedGrades, in.Grade) {
		add(CodeUngraded, Block, "This instrument's claim has not been classified, so what it legally represents is unknown.")
	}
	if in.Quarantined {
		add(CodeQuarantined, Block, "An expected corporate action and the observed state disagree, so this instrument is held back until they are reconciled.")
	}
	if in.Prerogatives.NonTransferable {
		add(CodeNonTransferable, Block, "This cannot be transferred at all.")
	}
	if in.Prerogatives.PausedNow {
		add(CodePaused, Block, "The issuer has paused all movement of this.")
	}
	if in.Prerogatives.FreezesNewAccounts {
		add(CodeFrozenByDefault, Block, "A new account for this starts frozen until the issuer approves it, so a recipient may be unable to receive.")
	}
	if in.Prerogatives.TransferHookState == "active" &&
		!contains(doc.AllowedHookPrograms, in.Prerogatives.TransferHookProgram) {
		add(CodeActiveHookUnknown, Block, "This checks who may receive it, using a program Seametry has not read.")
	}
	if in.MultiplierState.Present && !in.MultiplierState.Resolved {
		add(CodeMultiplierUnresolved, Block, "The quantity you appear to hold could not be resolved from this instrument's configuration.")
	}
	if len(in.UnknownExtensions) > 0 && doc.BlockOnUnknownExtension {
		add(CodeUnknownExtension, Block, "This carries an issuer control Seametry does not yet decode.")
	}
	if in.HaltedByIssuer && doc.BlockOnIssuerHalt {
		add(CodeHaltedByIssuer, Block, "The issuer has halted trading in this.")
	}
	reasons = append(reasons, depthReasons(doc, in.Depth)...)

	// Conditions a holder is told about and decides on themselves.
	if len(in.UnknownExtensions) > 0 && !doc.BlockOnUnknownExtension {
		for _, ext := range in.UnknownExtensions {
			add(CodeUnknownExtension, Warn,
				fmt.Sprintf("This carries an issuer control Seametry does not yet decode (Token-2022 extension %s).", ext))
		}
	}
	if in.HaltedByIssuer && !doc.BlockOnIssuerHalt {
		add(CodeHaltedByIssuer, Warn, "The issuer has halted trading in this.")
	}
	if in.Prerogatives.HasPermanentDelegate {
		add(CodePermanentDelegate, Warn, "The issuer can take this back from any wallet.")
	}
	if in.Prerogatives.HasFreezeAuthority {
		add(CodeFreezeAuthority, Warn, "The issuer can freeze this where it sits.")
	}
	if in.Prerogatives.Pausable && !in.Prerogatives.PausedNow {
		add(CodePausable, Warn, "The issuer can pause all movement of this.")
	}
	if in.Prerogatives.TransferHookState == "initialized_disabled" {
		add(CodeHookCanBeEnabled, Warn, "The issuer can switch on a check of who may receive this.")
	}
	if in.Prerogatives.CanChangeMultiplier {
		add(CodeMultiplierAuthority, Warn, "The issuer can change how many of these you appear to hold.")
	}
	if in.Prerogatives.HasMintAuthority {
		add(CodeSupplyMutable, Warn, "The issuer can create more of these.")
	}
	if in.MultiplierState.ActivationPending {
		add(CodeActivationPending, Warn, "A change to the quantity you appear to hold is scheduled and has not taken effect yet.")
	}

	// Recorded, but carrying no severity: this one is about other people's
	// systems rather than about the instrument. Seametry resolves the live
	// value correctly, so it is information rather than a finding against the
	// instrument, and saying so is more useful than staying quiet.
	if in.MultiplierState.NaiveIsStale {
		// The sentence states what is true; the two values stay in the input at
		// full precision, where an interface can render them properly. A
		// multiplier is a float64 on chain, so its exact decimal runs to fifty
		// odd places, and pasting that into a sentence is accurate and
		// unreadable at the same time.
		add(CodeNaiveReaderWrong, Allow,
			"The field named multiplier is behind the live value here, so anything reading that field alone is one corporate action out of date.")
	}

	// Stable ordering, most severe first, so a decision is byte identical
	// across runs and the interface never has to sort it.
	sort.SliceStable(reasons, func(i, j int) bool {
		if reasons[i].Severity.severity() != reasons[j].Severity.severity() {
			return reasons[i].Severity.severity() > reasons[j].Severity.severity()
		}
		return reasons[i].Code < reasons[j].Code
	})

	decision := Allow
	for _, r := range reasons {
		if r.Severity.severity() > decision.severity() {
			decision = r.Severity
		}
	}

	return Result{
		Decision:      decision,
		Reasons:       reasons,
		PolicyVersion: doc.Version,
		InputDigest:   hex.EncodeToString(digest[:]),
	}, nil
}

// depthReasons judges executable depth at the policy's reference size.
//
// Depth measured at some other size is treated as not observed here rather than
// stretched to fit, because a shortfall at 100 USDC says nothing about 1,000.
func depthReasons(doc Document, depth DepthFacts) []Reason {
	if !depth.Observed || depth.SizeUSDC != doc.DepthReferenceUSDC {
		return []Reason{{
			Code: CodeDepthNotObserved, Severity: Warn,
			Fact: fmt.Sprintf("Executable depth has not been observed at %d USDC.", doc.DepthReferenceUSDC),
		}}
	}

	switch depth.Availability {
	case "available":
		if depth.ShortfallBps != nil && *depth.ShortfallBps > doc.DepthCeilingBps {
			return []Reason{{
				Code: CodeDepthAboveCeiling, Severity: Block,
				Fact: fmt.Sprintf(
					"Buying %d USDC realises a rate %d basis points worse than buying %d USDC, above the %d basis point ceiling.",
					depth.SizeUSDC, *depth.ShortfallBps, depth.BaselineSizeUSDC, doc.DepthCeilingBps),
			}}
		}
		return nil
	case "no_route":
		return []Reason{{Code: CodeNoRoute, Severity: Block,
			Fact: fmt.Sprintf("No route to buy %d USDC of this was found.", depth.SizeUSDC)}}
	case "not_tradable":
		return []Reason{{Code: CodeNotTradable, Severity: Block,
			Fact: "The aggregator will not trade this token."}}
	}
	// An unknown availability keeps the provider's own words. It is never
	// mapped to a known refusal, because a reason we do not recognise is a fact
	// in its own right.
	return []Reason{{Code: CodeRefusalUnknown, Severity: Block,
		Fact: fmt.Sprintf("The aggregator refused with a reason Seametry does not recognise (%q).", depth.ProviderCode)}}
}

// DepthFromCurve reads the facts at one size off a measured curve.
//
// It records the size the shortfall was measured against, which is the
// smallest size that priced. A shortfall with no stated baseline is a bare
// number.
func DepthFromCurve(curve liquidity.Curve, sizeUSDC int64) (DepthFacts, error) {
	want, err := amount.FromInt64(sizeUSDC*1_000_000, 6)
	if err != nil {
		return DepthFacts{}, err
	}
	for _, point := range curve.Points {
		if !point.Size.Equal(want) {
			continue
		}
		facts := DepthFacts{
			Observed: true, SizeUSDC: sizeUSDC,
			Availability: string(point.Observation.Availability),
			ProviderCode: point.Observation.Code,
			ShortfallBps: point.ShortfallBps,
		}
		if curve.Reference >= 0 {
			baseline, err := wholeUSDC(curve.Points[curve.Reference].Size)
			if err != nil {
				return DepthFacts{}, err
			}
			facts.BaselineSizeUSDC = baseline
		}
		return facts, nil
	}
	return DepthFacts{}, nil
}

func wholeUSDC(size amount.Amount) (int64, error) {
	whole, err := size.Rescale(0, amount.RoundExact)
	if err != nil {
		return 0, fmt.Errorf("policy: size %s is not a whole number of USDC: %w", size, err)
	}
	if !whole.Atoms().IsInt64() {
		return 0, fmt.Errorf("policy: size %s is out of range", size)
	}
	return whole.Atoms().Int64(), nil
}

// FromRegistry flattens a decoded mint into decision inputs.
//
// It lives here rather than in registry so that registry stays a decoder with
// no opinion about what its findings mean.
func FromRegistry(symbol, mint, grade string, m *registry.Mint, asOf time.Time, slot uint64, halted, quarantined bool) (Input, error) {
	prerogatives, err := m.Prerogatives()
	if err != nil {
		return Input{}, fmt.Errorf("policy: %w", err)
	}

	in := Input{
		Symbol: symbol, Mint: mint, Grade: grade,
		AsOf: asOf.UTC(), ObservedAtSlot: slot,
		HaltedByIssuer: halted, Quarantined: quarantined,
		Prerogatives: PrerogativeFacts{
			HasFreezeAuthority:   prerogatives.FreezeAuthority != nil,
			HasPermanentDelegate: prerogatives.PermanentDelegate != nil,
			HasMintAuthority:     prerogatives.MintAuthority != nil,
			CanChangeMultiplier:  prerogatives.ScaledUIAuthority != nil,
			NonTransferable:      prerogatives.NonTransferable,
			TransferHookState:    prerogatives.TransferHook.State.String(),
		},
		UnknownExtensions: []string{},
	}
	if prerogatives.Pausable != nil {
		in.Prerogatives.Pausable = true
		in.Prerogatives.PausedNow = prerogatives.Pausable.Paused
	}
	if prerogatives.DefaultAccountState != nil {
		in.Prerogatives.FreezesNewAccounts = prerogatives.DefaultAccountState.FreezesNewAccounts()
	}
	if prerogatives.TransferHook.Program != nil {
		in.Prerogatives.TransferHookProgram = prerogatives.TransferHook.Program.String()
	}
	for _, ext := range prerogatives.UnknownExtensions {
		in.UnknownExtensions = append(in.UnknownExtensions, ext.String())
	}

	if config, ok, err := m.ScaledUIAmount(); err == nil && ok {
		in.MultiplierState.Present = true
		if resolved, err := config.Resolve(asOf); err == nil {
			in.MultiplierState.Resolved = true
			in.MultiplierState.NaiveIsStale = resolved.NaiveIsStale
			in.MultiplierState.ActivationPending = resolved.ActivationPending
			in.MultiplierState.LiveValue = resolved.Value.String()
			in.MultiplierState.NaiveValue = resolved.NaiveValue.String()
		}
	}
	return in, nil
}

func contains(list []string, value string) bool {
	for _, item := range list {
		if item == value {
			return true
		}
	}
	return false
}
