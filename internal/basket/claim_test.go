package basket

import (
	"encoding/json"
	"math/big"
	"math/rand"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"testing"

	"github.com/BeyndtechArc/Seametry/internal/amount"
)

const claimGoldenPath = "../../spec/claims/vectors.json"

type claimOp struct {
	Op     string
	Claim  string
	Units  string
	Actual string
}

// claimWorld runs operations against one leg and its claims, and checks after
// every one that no claimant could be paid more than the Hall holds for them.
type claimWorld struct {
	t      *testing.T
	scale  int32
	leg    Constituent
	claims map[string]Claim
	actual amount.Amount
}

func newClaimWorld(t *testing.T, scale int32, ledger string) *claimWorld {
	t.Helper()
	leg := constituent(t, "X", ledger, "0", "0", scale)
	return &claimWorld{t: t, scale: scale, leg: leg, claims: map[string]Claim{}, actual: leg.Ledger}
}

func (w *claimWorld) claim(name string) Claim {
	if c, ok := w.claims[name]; ok {
		return c
	}
	c, err := NewClaim(w.scale)
	if err != nil {
		w.t.Fatal(err)
	}
	return c
}

func (w *claimWorld) apply(op claimOp) {
	w.t.Helper()
	var err error
	switch op.Op {
	case "redeem":
		units := atoms(w.t, op.Units, w.scale)
		if w.leg.Ledger, err = w.leg.Ledger.Sub(units); err != nil {
			w.t.Fatal(err)
		}
		if w.leg.Unclaimed, err = w.leg.Unclaimed.Add(units); err != nil {
			w.t.Fatal(err)
		}
		w.claims[op.Claim], err = CreditClaim(w.claim(op.Claim), w.leg, units)
	case "sync":
		w.actual = atoms(w.t, op.Actual, w.scale)
		var result SyncResult
		if result, err = Sync(w.leg, w.actual, epoch, vestWindow); err == nil {
			w.leg = result.After
		}
	case "settle":
		w.claims[op.Claim], err = Settle(w.claim(op.Claim), w.leg)
	case "withdraw":
		units := atoms(w.t, op.Units, w.scale)
		w.claims[op.Claim], err = WithdrawClaim(w.claim(op.Claim), &w.leg, units)
		if err == nil {
			w.actual, err = w.actual.Sub(units)
		}
	default:
		w.t.Fatalf("unknown claim op %q", op.Op)
	}
	if err != nil {
		w.t.Fatalf("%s %s: %v", op.Op, op.Claim, err)
	}
	w.checkInvariants(op)
}

func (w *claimWorld) checkInvariants(op claimOp) {
	w.t.Helper()
	invariant(w.t, w.leg, w.actual, op.Op)

	total, err := amount.Zero(w.scale)
	if err != nil {
		w.t.Fatal(err)
	}
	for name := range w.claims {
		settled, err := Settle(w.claims[name], w.leg)
		if err != nil {
			w.t.Fatalf("%s: settling %s: %v", op.Op, name, err)
		}
		if total, err = total.Add(settled.Units); err != nil {
			w.t.Fatal(err)
		}
	}
	if cmp, err := total.Cmp(w.leg.Unclaimed); err != nil {
		w.t.Fatal(err)
	} else if cmp > 0 {
		w.t.Fatalf("after %s the claims are worth %s but the Hall holds only %s for them", op.Op, total, w.leg.Unclaimed)
	}
}

func (w *claimWorld) units(name string) string {
	settled, err := Settle(w.claim(name), w.leg)
	if err != nil {
		w.t.Fatal(err)
	}
	return settled.Units.AtomsString()
}

func TestSeizureScalesEveryClaimInProportion(t *testing.T) {
	w := newClaimWorld(t, 6, "1000000")
	w.apply(claimOp{Op: "redeem", Claim: "A", Units: "250000"})
	w.apply(claimOp{Op: "redeem", Claim: "B", Units: "150000"})

	// Half of everything the Hall holds is taken: 500000 of 1000000.
	w.apply(claimOp{Op: "sync", Actual: "500000"})

	if got := w.units("A"); got != "125000" {
		t.Errorf("A = %s, want 125000, half of 250000", got)
	}
	if got := w.units("B"); got != "75000" {
		t.Errorf("B = %s, want 75000, half of 150000", got)
	}
	if got := w.leg.Unclaimed.AtomsString(); got != "200000" {
		t.Errorf("unclaimed = %s, want 200000", got)
	}
}

func TestAClaimMadeAfterASeizureIsNotScaledByIt(t *testing.T) {
	w := newClaimWorld(t, 6, "1000000")
	w.apply(claimOp{Op: "redeem", Claim: "A", Units: "400000"})
	w.apply(claimOp{Op: "sync", Actual: "500000"})
	w.apply(claimOp{Op: "redeem", Claim: "C", Units: "100000"})

	if got := w.units("C"); got != "100000" {
		t.Errorf("C = %s, want 100000: it did not exist during the seizure", got)
	}
	if got := w.units("A"); got != "200000" {
		t.Errorf("A = %s, want 200000, half of 400000", got)
	}
}

func TestCreditingAnExistingClaimSettlesItFirst(t *testing.T) {
	w := newClaimWorld(t, 6, "1000000")
	w.apply(claimOp{Op: "redeem", Claim: "A", Units: "400000"})
	w.apply(claimOp{Op: "sync", Actual: "500000"})
	w.apply(claimOp{Op: "redeem", Claim: "A", Units: "100000"})

	if got := w.units("A"); got != "300000" {
		t.Errorf("A = %s, want 300000: the old 400000 halved to 200000, plus the new 100000", got)
	}
}

func TestWipingOutUnclaimedStartsANewEpoch(t *testing.T) {
	w := newClaimWorld(t, 6, "400000")
	w.apply(claimOp{Op: "redeem", Claim: "A", Units: "400000"})
	w.apply(claimOp{Op: "sync", Actual: "0"})

	if w.leg.ClaimEpoch != 1 {
		t.Fatalf("epoch = %d, want 1 after everything was taken", w.leg.ClaimEpoch)
	}
	if got := w.units("A"); got != "0" {
		t.Errorf("A = %s, want 0", got)
	}

	// A donation returns balance to the Hall, and a later melt is a fresh claim.
	w.leg.Ledger = atoms(t, "300000", 6)
	w.actual = atoms(t, "300000", 6)
	w.apply(claimOp{Op: "redeem", Claim: "B", Units: "300000"})
	if got := w.units("B"); got != "300000" {
		t.Errorf("B = %s, want 300000: the old epoch must not touch it", got)
	}
	if got := w.units("A"); got != "0" {
		t.Errorf("A = %s, want it to stay 0", got)
	}
}

func TestRoundingLeavesDustWithTheHallNeverWithAClaimant(t *testing.T) {
	w := newClaimWorld(t, 6, "3")
	for _, name := range []string{"A", "B", "C"} {
		w.apply(claimOp{Op: "redeem", Claim: name, Units: "1"})
	}
	w.apply(claimOp{Op: "sync", Actual: "2"})

	for _, name := range []string{"A", "B", "C"} {
		if got := w.units(name); got != "0" {
			t.Errorf("%s = %s, want 0: two thirds of one unit rounds down", name, got)
		}
	}
	if got := w.leg.Unclaimed.AtomsString(); got != "2" {
		t.Errorf("unclaimed = %s, want 2: the dust stays in the Hall", got)
	}
}

func TestWithdrawingAfterASeizureReducesUnclaimedByWhatIsPaid(t *testing.T) {
	w := newClaimWorld(t, 6, "1000000")
	w.apply(claimOp{Op: "redeem", Claim: "A", Units: "400000"})
	w.apply(claimOp{Op: "sync", Actual: "500000"})
	w.apply(claimOp{Op: "withdraw", Claim: "A", Units: "150000"})

	if got := w.units("A"); got != "50000" {
		t.Errorf("A = %s, want 50000", got)
	}
	if got := w.leg.Unclaimed.AtomsString(); got != "50000" {
		t.Errorf("unclaimed = %s, want 50000", got)
	}
}

func TestWithdrawingMoreThanTheSettledClaimIsRefused(t *testing.T) {
	w := newClaimWorld(t, 6, "1000000")
	w.apply(claimOp{Op: "redeem", Claim: "A", Units: "400000"})
	w.apply(claimOp{Op: "sync", Actual: "500000"})

	_, err := WithdrawClaim(w.claim("A"), &w.leg, atoms(t, "300000", 6))
	if err == nil {
		t.Fatal("withdrew 300000 against a claim that a seizure shrank to 200000")
	}
}

// TestClaimsNeverExceedWhatTheHallHolds throws random melts, seizures,
// donations and withdrawals at one leg. checkInvariants fails the moment the
// claims could be paid more than the Hall holds for them.
func TestClaimsNeverExceedWhatTheHallHolds(t *testing.T) {
	names := []string{"A", "B", "C", "D"}
	rng := rand.New(rand.NewSource(20260925))

	for run := 0; run < 200; run++ {
		w := newClaimWorld(t, 6, "1000000000")
		for step := 0; step < 40; step++ {
			name := names[rng.Intn(len(names))]
			switch rng.Intn(4) {
			case 0:
				max := w.leg.Ledger.Atoms().Int64()
				if max > 0 {
					w.apply(claimOp{Op: "redeem", Claim: name, Units: big.NewInt(1 + rng.Int63n(max)).String()})
				}
			case 1:
				held := w.actual.Atoms().Int64()
				w.apply(claimOp{Op: "sync", Actual: big.NewInt(rng.Int63n(held + 1)).String()})
			case 2:
				held := w.actual.Atoms().Int64()
				w.apply(claimOp{Op: "sync", Actual: big.NewInt(held + rng.Int63n(1000)).String()})
			default:
				settled, err := Settle(w.claim(name), w.leg)
				if err != nil {
					t.Fatal(err)
				}
				if n := settled.Units.Atoms().Int64(); n > 0 {
					w.apply(claimOp{Op: "withdraw", Claim: name, Units: big.NewInt(1 + rng.Int63n(n)).String()})
				}
			}
		}
	}
}

/* Golden vectors, shared with the Rust program. */

type claimVectorStep struct {
	Op          string `json:"op"`
	Claim       string `json:"claim,omitempty"`
	Units       string `json:"units,omitempty"`
	Actual      string `json:"actual,omitempty"`
	Ledger      string `json:"ledger"`
	Pending     string `json:"pending"`
	Unclaimed   string `json:"unclaimed"`
	LegIndex    string `json:"leg_index"`
	LegEpoch    uint32 `json:"leg_epoch"`
	ClaimUnits  string `json:"claim_units,omitempty"`
	ClaimIndex  string `json:"claim_index,omitempty"`
	ClaimEpoch  uint32 `json:"claim_epoch,omitempty"`
	HasSnapshot bool   `json:"has_snapshot,omitempty"`
}

type claimVectorScenario struct {
	Name    string            `json:"name"`
	Purpose string            `json:"purpose"`
	Scale   int32             `json:"scale"`
	Ledger  string            `json:"ledger"`
	Steps   []claimVectorStep `json:"steps"`
}

type claimVectorFile struct {
	Note      string                `json:"note"`
	ClaimOne  string                `json:"claim_one"`
	Scenarios []claimVectorScenario `json:"scenarios"`
}

func recordClaimStep(w *claimWorld, op claimOp) claimVectorStep {
	step := claimVectorStep{
		Op: op.Op, Claim: op.Claim, Units: op.Units, Actual: op.Actual,
		Ledger:    w.leg.Ledger.AtomsString(),
		Pending:   w.leg.Pending.AtomsString(),
		Unclaimed: w.leg.Unclaimed.AtomsString(),
		LegIndex:  w.leg.claimIndex().String(),
		LegEpoch:  w.leg.ClaimEpoch,
	}
	if op.Claim != "" {
		c := w.claim(op.Claim)
		step.ClaimUnits = c.Units.AtomsString()
		if c.Index != nil {
			step.HasSnapshot = true
			step.ClaimIndex = c.Index.String()
			step.ClaimEpoch = c.Epoch
		}
	}
	return step
}

func buildClaimVectors(t *testing.T) claimVectorFile {
	t.Helper()
	type scenario struct {
		name, purpose, ledger string
		ops                   []claimOp
	}
	scenarios := []scenario{
		{
			name:    "a seizure scales every claim in proportion",
			purpose: "Half of what the Hall holds is taken, so each claim is worth half of what it was and the claims still sum to no more than unclaimed.",
			ledger:  "1000000",
			ops: []claimOp{
				{Op: "redeem", Claim: "A", Units: "250000"},
				{Op: "redeem", Claim: "B", Units: "150000"},
				{Op: "sync", Actual: "500000"},
				{Op: "settle", Claim: "A"},
				{Op: "settle", Claim: "B"},
			},
		},
		{
			name:    "a claim made after a seizure is not scaled by it",
			purpose: "Units credited after a seizure start from the index in force then, so an earlier loss cannot reduce them.",
			ledger:  "1000000",
			ops: []claimOp{
				{Op: "redeem", Claim: "A", Units: "400000"},
				{Op: "sync", Actual: "500000"},
				{Op: "redeem", Claim: "C", Units: "100000"},
				{Op: "settle", Claim: "A"},
				{Op: "settle", Claim: "C"},
			},
		},
		{
			name:    "taking everything starts a new epoch",
			purpose: "When unclaimed is wiped out the index cannot express the loss, so the epoch advances and every older claim settles to zero.",
			ledger:  "400000",
			ops: []claimOp{
				{Op: "redeem", Claim: "A", Units: "400000"},
				{Op: "sync", Actual: "0"},
				{Op: "settle", Claim: "A"},
			},
		},
		{
			name:    "rounding leaves dust with the Hall",
			purpose: "Two thirds of one unit rounds down to nothing for each of three claimants. The remainder stays in unclaimed and is never paid to anyone.",
			ledger:  "3",
			ops: []claimOp{
				{Op: "redeem", Claim: "A", Units: "1"},
				{Op: "redeem", Claim: "B", Units: "1"},
				{Op: "redeem", Claim: "C", Units: "1"},
				{Op: "sync", Actual: "2"},
				{Op: "settle", Claim: "A"},
				{Op: "settle", Claim: "B"},
				{Op: "settle", Claim: "C"},
			},
		},
		{
			name:    "withdrawing after a seizure pays the settled amount",
			purpose: "A withdrawal settles the claim first and reduces unclaimed by exactly what is paid.",
			ledger:  "1000000",
			ops: []claimOp{
				{Op: "redeem", Claim: "A", Units: "400000"},
				{Op: "sync", Actual: "500000"},
				{Op: "withdraw", Claim: "A", Units: "150000"},
			},
		},
	}

	file := claimVectorFile{
		Note: "How a claim shrinks when a seizure takes part of a leg's unclaimed balance, shared by the Go " +
			"implementation and the Rust program. Amounts are integer atoms as strings at the stated scale. " +
			"The index is a 64 bit fixed point number, and claim_one is 1.0. Regenerate with " +
			"go test ./internal/basket -update. A vector is never edited to make an implementation pass.",
		ClaimOne: ClaimOne.String(),
	}
	for _, s := range scenarios {
		w := newClaimWorld(t, 6, s.ledger)
		out := claimVectorScenario{Name: s.name, Purpose: s.purpose, Scale: 6, Ledger: s.ledger}
		for _, op := range s.ops {
			w.apply(op)
			out.Steps = append(out.Steps, recordClaimStep(w, op))
		}
		file.Scenarios = append(file.Scenarios, out)
	}
	return file
}

func TestClaimGoldenVectors(t *testing.T) {
	built := buildClaimVectors(t)

	if *update {
		body, err := json.MarshalIndent(built, "", "  ")
		if err != nil {
			t.Fatal(err)
		}
		if err := os.MkdirAll(filepath.Dir(claimGoldenPath), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(claimGoldenPath, append(body, '\n'), 0o644); err != nil {
			t.Fatal(err)
		}
		t.Logf("wrote %s with %d scenarios", claimGoldenPath, len(built.Scenarios))
		return
	}

	raw, err := os.ReadFile(claimGoldenPath)
	if err != nil {
		t.Fatalf("read %s: %v (generate it with: go test ./internal/basket -update)", claimGoldenPath, err)
	}
	var want claimVectorFile
	if err := json.Unmarshal(raw, &want); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(built, want) {
		t.Fatalf("claim vectors drifted from %s. Regenerate deliberately with -update and review the diff; never edit the file to make code pass.", claimGoldenPath)
	}
	names := make([]string, 0, len(want.Scenarios))
	for _, s := range want.Scenarios {
		names = append(names, s.Name)
	}
	sort.Strings(names)
	t.Logf("%d claim scenarios verified: %v", len(names), names)
}
