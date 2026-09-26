package basket

import (
	"encoding/json"
	"flag"
	"fmt"
	"math/big"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/BeyndtechArc/Seametry/internal/amount"
)

var update = flag.Bool("update", false, "rewrite spec/recipe/vectors.json")

const goldenPath = "../../spec/recipe/vectors.json"

// vestWindow is the compiled constant the Hall will ship with. One hour is long
// enough that a donation cannot move share value within a block and short
// enough that a real dividend reaches holders the same day.
const vestWindow = time.Hour

var epoch = time.Date(2026, 9, 24, 12, 0, 0, 0, time.UTC)

func atoms(t *testing.T, v string, scale int32) amount.Amount {
	t.Helper()
	a, err := amount.ParseAtoms(v, scale)
	if err != nil {
		t.Fatal(err)
	}
	return a
}

func constituent(t *testing.T, mint, ledger, pending, unclaimed string, scale int32) Constituent {
	t.Helper()
	return Constituent{
		Mint:      mint,
		Ledger:    atoms(t, ledger, scale),
		Pending:   atoms(t, pending, scale),
		Unclaimed: atoms(t, unclaimed, scale),
		VestStart: epoch,
		VestEnd:   epoch.Add(vestWindow),
	}
}

// invariant is the property every operation must preserve:
// actual balance == ledger + pending + unclaimed.
func invariant(t *testing.T, c Constituent, actual amount.Amount, context string) {
	t.Helper()
	expected, err := c.Expected()
	if err != nil {
		t.Fatalf("%s: %v", context, err)
	}
	if !expected.Equal(actual) {
		t.Errorf("%s: invariant broken for %s: ledger+pending+unclaimed = %s, actual balance %s",
			context, c.Mint, expected, actual)
	}
}

func TestRequiredInRoundsUpAndOutRoundsDown(t *testing.T) {
	// A supply and ledger chosen so the division leaves a remainder.
	c := constituent(t, "AAPLx", "1000003", "0", "0", 6)
	supply := big.NewInt(7)

	for _, shares := range []int64{1, 2, 3, 5, 6} {
		n := big.NewInt(shares)
		required, err := RequiredIn(c, n, supply)
		if err != nil {
			t.Fatal(err)
		}
		out, err := Out(c, n, supply)
		if err != nil {
			t.Fatal(err)
		}

		exact := new(big.Int).Div(new(big.Int).Mul(c.Ledger.Atoms(), n), supply)
		if required.Atoms().Cmp(exact) < 0 {
			t.Errorf("shares=%d: required input %s rounded below the exact value %s", shares, required, exact)
		}
		if out.Atoms().Cmp(exact) > 0 {
			t.Errorf("shares=%d: output %s rounded above the exact value %s", shares, out, exact)
		}
		if cmp, _ := out.Cmp(required); cmp > 0 {
			t.Errorf("shares=%d: output %s exceeds required input %s, so a round trip would profit the caller",
				shares, out, required)
		}
	}
}

// Striking then immediately melting the same shares must never return more than
// was put in. If it could, the alloy would be a faucet.
func TestStrikeThenMeltNeverProfits(t *testing.T) {
	for _, ledger := range []string{"1", "7", "999983", "1000000007"} {
		for _, supply := range []int64{1, 3, 7, 1000003} {
			a := &Alloy{
				Supply:       big.NewInt(supply),
				Constituents: []Constituent{constituent(t, "X", ledger, "0", "0", 6)},
			}
			shares := big.NewInt(2)

			inputs, err := Create(a, shares, []amount.Amount{atoms(t, "99999999999999", 6)})
			if err != nil {
				t.Fatal(err)
			}
			if err := ApplyCreate(a, shares, inputs); err != nil {
				t.Fatal(err)
			}
			legs, err := Redeem(a, shares)
			if err != nil {
				t.Fatal(err)
			}

			if cmp, _ := legs[0].Cmp(inputs[0]); cmp > 0 {
				t.Errorf("ledger=%s supply=%d: melting returned %s for a strike costing %s",
					ledger, supply, legs[0], inputs[0])
			}
		}
	}
}

// sync is permissionless, so anyone can call it as often as they like. Calling
// it again at the same instant must not vest anything more, or a donor could
// finish a vest early by repeating the call.
func TestRepeatedSyncsAtOneInstantVestNothingMore(t *testing.T) {
	donated := atoms(t, "2000000", 6)
	credited, err := Sync(constituent(t, "X", "1000000", "0", "0", 6), donated, epoch, vestWindow)
	if err != nil {
		t.Fatal(err)
	}
	halfway := epoch.Add(vestWindow / 2)

	c := credited.After
	for call := 1; call <= 5; call++ {
		result, err := Sync(c, donated, halfway, vestWindow)
		if err != nil {
			t.Fatal(err)
		}
		c = result.After
		if got := c.Ledger.AtomsString(); got != "1500000" {
			t.Fatalf("call %d at the halfway point left the ledger at %s, want 1500000: a repeated sync vested more", call, got)
		}
	}
}

// Syncing at several instants must vest exactly what one sync at the last
// instant would, because vesting is linear in time and not in the number of
// calls.
func TestChainedSyncsVestLinearly(t *testing.T) {
	donated := atoms(t, "2000000", 6)
	credited, err := Sync(constituent(t, "X", "1000000", "0", "0", 6), donated, epoch, vestWindow)
	if err != nil {
		t.Fatal(err)
	}

	c := credited.After
	for _, want := range []struct {
		at     time.Duration
		ledger string
	}{
		{vestWindow / 4, "1250000"},
		{vestWindow / 2, "1500000"},
		{3 * vestWindow / 4, "1750000"},
		{vestWindow, "2000000"},
	} {
		result, err := Sync(c, donated, epoch.Add(want.at), vestWindow)
		if err != nil {
			t.Fatal(err)
		}
		c = result.After
		if got := c.Ledger.AtomsString(); got != want.ledger {
			t.Errorf("at %s the ledger is %s, want %s", want.at, got, want.ledger)
		}
		invariant(t, c, donated, want.at.String())
	}
}

// The property the vest exists for. A donor cannot lift share value in a block,
// and ends poorer than they began.
func TestDonationDoesNotRaiseValueImmediately(t *testing.T) {
	c := constituent(t, "X", "1000000", "0", "0", 6)
	supply := big.NewInt(1000)

	before, err := Out(c, big.NewInt(1), supply)
	if err != nil {
		t.Fatal(err)
	}

	// Someone donates the ledger's own size again, doubling the balance.
	donated := atoms(t, "2000000", 6)
	result, err := Sync(c, donated, epoch, vestWindow)
	if err != nil {
		t.Fatal(err)
	}
	if result.Kind != SyncCredit {
		t.Fatalf("a donation is a credit, got %s", result.Kind)
	}
	invariant(t, result.After, donated, "after donation")

	atOnce, err := Out(result.After, big.NewInt(1), supply)
	if err != nil {
		t.Fatal(err)
	}
	if !atOnce.Equal(before) {
		t.Errorf("units per share moved in the same instant as the donation: %s became %s", before, atOnce)
	}

	// Syncing again at the same instant must still fold nothing. Checking only
	// the state immediately after the credit is not enough: a resolver that
	// vested everything at once would pass that, because the fold happens on
	// the following sync rather than on the one that recorded the surplus.
	again, err := Sync(result.After, donated, epoch, vestWindow)
	if err != nil {
		t.Fatal(err)
	}
	if !again.VestedIn.IsZero() {
		t.Errorf("no time has passed, so nothing may vest, but %s folded into the ledger", again.VestedIn)
	}
	if !again.After.Ledger.Equal(result.After.Ledger) {
		t.Errorf("the ledger moved without time passing: %s became %s", result.After.Ledger, again.After.Ledger)
	}

	// Halfway through the window, half has vested.
	half, err := Sync(result.After, donated, epoch.Add(vestWindow/2), vestWindow)
	if err != nil {
		t.Fatal(err)
	}
	invariant(t, half.After, donated, "halfway through the vest")
	midway, err := Out(half.After, big.NewInt(1), supply)
	if err != nil {
		t.Fatal(err)
	}
	if cmp, _ := midway.Cmp(before); cmp <= 0 {
		t.Error("half way through the window some of the credit should have vested")
	}

	// After the window, all of it.
	full, err := Sync(half.After, donated, epoch.Add(2*vestWindow), vestWindow)
	if err != nil {
		t.Fatal(err)
	}
	invariant(t, full.After, donated, "after the vest")
	if !full.After.Pending.IsZero() {
		t.Errorf("the whole credit should have vested, %s still pending", full.After.Pending)
	}
	if !full.After.Ledger.Equal(donated) {
		t.Errorf("ledger should hold the whole balance after vesting, got %s of %s", full.After.Ledger, donated)
	}
}

// A credit never raises units per share faster than the window allows, checked
// across the whole window rather than at its ends.
func TestCreditVestsMonotonicallyAndNeverEarly(t *testing.T) {
	c := constituent(t, "X", "1000000", "0", "0", 6)
	supply := big.NewInt(1000)
	credited := atoms(t, "1500000", 6)

	start, err := Sync(c, credited, epoch, vestWindow)
	if err != nil {
		t.Fatal(err)
	}

	var previous amount.Amount
	for step := 0; step <= 10; step++ {
		at := epoch.Add(time.Duration(step) * vestWindow / 10)
		synced, err := Sync(start.After, credited, at, vestWindow)
		if err != nil {
			t.Fatal(err)
		}
		invariant(t, synced.After, credited, fmt.Sprintf("step %d", step))

		perShare, err := Out(synced.After, big.NewInt(1), supply)
		if err != nil {
			t.Fatal(err)
		}
		if step > 0 {
			if cmp, _ := perShare.Cmp(previous); cmp < 0 {
				t.Errorf("step %d: units per share fell during vesting, %s then %s", step, previous, perShare)
			}
		}
		previous = perShare
	}
}

// Losses apply at once, which is the conservative direction for anyone pricing
// a share.
func TestSeizureAppliesImmediately(t *testing.T) {
	c := constituent(t, "X", "1000000", "0", "0", 6)
	seized := atoms(t, "600000", 6)

	result, err := Sync(c, seized, epoch, vestWindow)
	if err != nil {
		t.Fatal(err)
	}
	if result.Kind != SyncDeficit {
		t.Fatalf("expected a deficit, got %s", result.Kind)
	}
	if !result.Delta.Equal(atoms(t, "400000", 6)) {
		t.Errorf("deficit %s, want 400000", result.Delta)
	}
	invariant(t, result.After, seized, "after seizure")
	if !result.After.Ledger.Equal(seized) {
		t.Errorf("the whole loss should fall on the ledger here, got %s", result.After.Ledger)
	}
}

// A deficit consumes unvested pending before it touches anyone's position.
func TestDeficitConsumesPendingFirst(t *testing.T) {
	c := constituent(t, "X", "1000000", "0", "0", 6)

	credited, err := Sync(c, atoms(t, "1300000", 6), epoch, vestWindow)
	if err != nil {
		t.Fatal(err)
	}
	if !credited.After.Pending.Equal(atoms(t, "300000", 6)) {
		t.Fatalf("pending %s, want 300000", credited.After.Pending)
	}

	// An issuer takes 200000 before any of it vests.
	seized, err := Sync(credited.After, atoms(t, "1100000", 6), epoch, vestWindow)
	if err != nil {
		t.Fatal(err)
	}
	if seized.Kind != SyncDeficit {
		t.Fatalf("expected a deficit, got %s", seized.Kind)
	}
	invariant(t, seized.After, atoms(t, "1100000", 6), "after seizure against pending")
	if !seized.After.Ledger.Equal(atoms(t, "1000000", 6)) {
		t.Errorf("the ledger should be untouched while pending can absorb the loss, got %s", seized.After.Ledger)
	}
	if !seized.After.Pending.Equal(atoms(t, "100000", 6)) {
		t.Errorf("pending %s, want 100000", seized.After.Pending)
	}
}

// A seizure larger than pending falls pro rata on holders and claimants, so
// neither group absorbs the whole loss.
func TestLargeSeizureSplitsProRata(t *testing.T) {
	c := constituent(t, "X", "600000", "0", "400000", 6)
	balance := atoms(t, "1000000", 6)
	invariant(t, c, balance, "before")

	// Half of everything is taken.
	result, err := Sync(c, atoms(t, "500000", 6), epoch, vestWindow)
	if err != nil {
		t.Fatal(err)
	}
	if result.Kind != SyncDeficit {
		t.Fatalf("expected a deficit, got %s", result.Kind)
	}
	invariant(t, result.After, atoms(t, "500000", 6), "after a large seizure")

	if result.After.Ledger.Sign() <= 0 || result.After.Unclaimed.Sign() <= 0 {
		t.Fatalf("both sides should survive a proportional loss: ledger %s, unclaimed %s",
			result.After.Ledger, result.After.Unclaimed)
	}
	// 40 percent of the position was unclaimed, so it should carry about 40
	// percent of a 500000 loss.
	if !result.After.Unclaimed.Equal(atoms(t, "200000", 6)) {
		t.Errorf("unclaimed %s, want 200000", result.After.Unclaimed)
	}
	if !result.After.Ledger.Equal(atoms(t, "300000", 6)) {
		t.Errorf("ledger %s, want 300000", result.After.Ledger)
	}
}

// A multiplier-only issuer changes no raw balance, so sync must find nothing.
// This is the xStocks case and it is the common one.
func TestMultiplierOnlyIssuerProducesNoSync(t *testing.T) {
	c := constituent(t, "AAPLx", "1000000", "0", "0", 6)
	balance := atoms(t, "1000000", 6)

	result, err := Sync(c, balance, epoch.Add(30*24*time.Hour), vestWindow)
	if err != nil {
		t.Fatal(err)
	}
	if result.Kind != SyncUnchanged {
		t.Fatalf("a multiplier change moves no raw units, got %s", result.Kind)
	}
	invariant(t, result.After, balance, "multiplier only")
}

func TestCreateRefusesAboveTheStatedMaximum(t *testing.T) {
	a := &Alloy{
		Supply:       big.NewInt(1000),
		Constituents: []Constituent{constituent(t, "X", "1000000", "0", "0", 6)},
	}
	// One share needs 1000 units.
	if _, err := Create(a, big.NewInt(1), []amount.Amount{atoms(t, "999", 6)}); err == nil {
		t.Fatal("a required input above the stated maximum must be refused")
	}
	if _, err := Create(a, big.NewInt(1), []amount.Amount{atoms(t, "1000", 6)}); err != nil {
		t.Fatalf("a required input at the maximum must be accepted: %v", err)
	}
}

// Melting moves units from the ledger to unclaimed without changing the total,
// which is what lets a melt succeed while a constituent is frozen.
func TestRedeemMovesLedgerToUnclaimedWithoutChangingTheTotal(t *testing.T) {
	a := &Alloy{
		Supply:       big.NewInt(1000),
		Constituents: []Constituent{constituent(t, "X", "1000000", "0", "0", 6)},
	}
	balance := atoms(t, "1000000", 6)

	legs, err := Redeem(a, big.NewInt(400))
	if err != nil {
		t.Fatal(err)
	}
	if err := ApplyRedeem(a, big.NewInt(400), legs); err != nil {
		t.Fatal(err)
	}

	invariant(t, a.Constituents[0], balance, "after melt")
	if !a.Constituents[0].Unclaimed.Equal(atoms(t, "400000", 6)) {
		t.Errorf("unclaimed %s, want 400000", a.Constituents[0].Unclaimed)
	}
	if a.Supply.Cmp(big.NewInt(600)) != 0 {
		t.Errorf("supply %s, want 600", a.Supply)
	}
}

func TestWithdrawCannotExceedWhatIsOwed(t *testing.T) {
	c := constituent(t, "X", "0", "0", "500", 6)
	if err := Withdraw(&c, atoms(t, "501", 6)); err == nil {
		t.Fatal("a withdrawal beyond the claim must be refused")
	}
	if err := Withdraw(&c, atoms(t, "500", 6)); err != nil {
		t.Fatal(err)
	}
	if !c.Unclaimed.IsZero() {
		t.Errorf("unclaimed %s, want zero", c.Unclaimed)
	}
}

// Twelve constituents at mixed decimals, which is the ceiling the account limit
// imposes and the shape a real alloy takes.
func TestTwelveConstituentsAtMixedScales(t *testing.T) {
	a := &Alloy{Supply: big.NewInt(1000)}
	scales := []int32{0, 2, 6, 8, 9, 6, 2, 8, 0, 9, 6, 8}
	for i, scale := range scales {
		a.Constituents = append(a.Constituents,
			constituent(t, fmt.Sprintf("M%02d", i), fmt.Sprintf("%d", 1000000+i*7919), "0", "0", scale))
	}

	maximums := make([]amount.Amount, len(a.Constituents))
	for i := range maximums {
		maximums[i] = atoms(t, "999999999999", scales[i])
	}

	inputs, err := Create(a, big.NewInt(3), maximums)
	if err != nil {
		t.Fatal(err)
	}
	for i, in := range inputs {
		if in.Scale() != scales[i] {
			t.Errorf("constituent %d: scale %d, want %d; a strike must not rescale a constituent", i, in.Scale(), scales[i])
		}
	}
}

/* Golden vectors, shared with the Rust program. */

type vectorStep struct {
	Op        string `json:"op"`
	AtSeconds int64  `json:"at_seconds,omitempty"`
	Shares    string `json:"shares,omitempty"`
	Actual    string `json:"actual,omitempty"`
	Result    string `json:"result,omitempty"`
	Kind      string `json:"kind,omitempty"`
	Ledger    string `json:"ledger"`
	Pending   string `json:"pending"`
	Unclaimed string `json:"unclaimed"`
	Supply    string `json:"supply"`
	// Chain means the step's resulting state carries into the next step. Steps
	// without it are evaluated from the state at second zero and discarded, so
	// they show one instant each. The chained scenario below exists because
	// that convention cannot expose a defect that only repeated calls reach.
	Chain bool `json:"chain,omitempty"`
}

type vectorScenario struct {
	Name    string       `json:"name"`
	Purpose string       `json:"purpose"`
	Scale   int32        `json:"scale"`
	Steps   []vectorStep `json:"steps"`
}

type vectorFile struct {
	Note              string           `json:"note"`
	VestWindowSeconds int64            `json:"vest_window_seconds"`
	Scenarios         []vectorScenario `json:"scenarios"`
}

func buildVectors(t *testing.T) vectorFile {
	t.Helper()
	file := vectorFile{
		Note: "The Hall's arithmetic, shared by the Go implementation and the Rust program. " +
			"Amounts are integer atoms as strings at the stated scale; shares are plain integers. " +
			"Times are seconds from the start of each scenario. Regenerate with " +
			"go test ./internal/basket -update. A vector is never edited to make an implementation pass.",
		VestWindowSeconds: int64(vestWindow.Seconds()),
	}

	record := func(c Constituent, supply *big.Int) (string, string, string, string) {
		return c.Ledger.AtomsString(), c.Pending.AtomsString(), c.Unclaimed.AtomsString(), supply.String()
	}

	// Scenario: a donation vests rather than landing at once.
	{
		c := constituent(t, "X", "1000000", "0", "0", 6)
		supply := big.NewInt(1000)
		s := vectorScenario{
			Name:    "donation vests over the window",
			Purpose: "A donated surplus becomes pending and enters the ledger linearly, so share value cannot jump in one block.",
			Scale:   6,
		}
		l, p, u, sup := record(c, supply)
		s.Steps = append(s.Steps, vectorStep{Op: "initial", Ledger: l, Pending: p, Unclaimed: u, Supply: sup})

		donated := atoms(t, "2000000", 6)
		for _, at := range []time.Duration{0, vestWindow / 4, vestWindow / 2, vestWindow, 2 * vestWindow} {
			result, err := Sync(c, donated, epoch.Add(at), vestWindow)
			if err != nil {
				t.Fatal(err)
			}
			if at == 0 {
				c = result.After
			}
			l, p, u, sup = record(result.After, supply)
			s.Steps = append(s.Steps, vectorStep{
				Op: "sync", AtSeconds: int64(at.Seconds()), Actual: donated.AtomsString(),
				Kind: string(result.Kind), Ledger: l, Pending: p, Unclaimed: u, Supply: sup,
			})
		}
		file.Scenarios = append(file.Scenarios, s)
	}

	// Scenario: repeated syncs, at one instant and across several, vest no
	// faster than one sync at the last instant would.
	{
		c := constituent(t, "X", "1000000", "0", "0", 6)
		supply := big.NewInt(1000)
		s := vectorScenario{
			Name:    "repeated syncs vest linearly",
			Purpose: "Sync is permissionless, so calling it again, at the same instant or at later ones, must not vest more than the elapsed time allows.",
			Scale:   6,
		}
		l, p, u, sup := record(c, supply)
		s.Steps = append(s.Steps, vectorStep{Op: "initial", Ledger: l, Pending: p, Unclaimed: u, Supply: sup})

		donated := atoms(t, "2000000", 6)
		for _, at := range []time.Duration{
			0, vestWindow / 2, vestWindow / 2, vestWindow / 2,
			3 * vestWindow / 4, 3 * vestWindow / 4, vestWindow, vestWindow,
		} {
			result, err := Sync(c, donated, epoch.Add(at), vestWindow)
			if err != nil {
				t.Fatal(err)
			}
			c = result.After
			l, p, u, sup = record(c, supply)
			s.Steps = append(s.Steps, vectorStep{
				Op: "sync", AtSeconds: int64(at.Seconds()), Actual: donated.AtomsString(),
				Kind: string(result.Kind), Ledger: l, Pending: p, Unclaimed: u, Supply: sup, Chain: true,
			})
		}
		file.Scenarios = append(file.Scenarios, s)
	}

	// Scenario: a seizure larger than pending splits pro rata.
	{
		c := constituent(t, "X", "600000", "0", "400000", 6)
		supply := big.NewInt(1000)
		s := vectorScenario{
			Name:    "seizure larger than pending",
			Purpose: "A loss consumes unvested pending first, then falls on ledger and unclaimed in proportion, so neither group absorbs it alone.",
			Scale:   6,
		}
		l, p, u, sup := record(c, supply)
		s.Steps = append(s.Steps, vectorStep{Op: "initial", Ledger: l, Pending: p, Unclaimed: u, Supply: sup})

		for _, actual := range []string{"900000", "500000", "100000"} {
			balance := atoms(t, actual, 6)
			result, err := Sync(c, balance, epoch, vestWindow)
			if err != nil {
				t.Fatal(err)
			}
			c = result.After
			l, p, u, sup = record(c, supply)
			s.Steps = append(s.Steps, vectorStep{
				Op: "sync", Actual: actual, Kind: string(result.Kind),
				Ledger: l, Pending: p, Unclaimed: u, Supply: sup,
			})
		}
		file.Scenarios = append(file.Scenarios, s)
	}

	// Scenario: strike and melt at a supply that leaves a remainder.
	{
		a := &Alloy{
			Supply:       big.NewInt(1000003),
			Constituents: []Constituent{constituent(t, "X", "999983", "0", "0", 6)},
		}
		s := vectorScenario{
			Name:    "strike and melt with rounding",
			Purpose: "Required inputs round up and outputs round down at a supply that leaves a remainder, so a round trip never profits the caller.",
			Scale:   6,
		}
		l, p, u, sup := record(a.Constituents[0], a.Supply)
		s.Steps = append(s.Steps, vectorStep{Op: "initial", Ledger: l, Pending: p, Unclaimed: u, Supply: sup})

		for _, shares := range []int64{1, 7, 1000} {
			n := big.NewInt(shares)
			inputs, err := Create(a, n, []amount.Amount{atoms(t, "999999999999", 6)})
			if err != nil {
				t.Fatal(err)
			}
			if err := ApplyCreate(a, n, inputs); err != nil {
				t.Fatal(err)
			}
			l, p, u, sup = record(a.Constituents[0], a.Supply)
			s.Steps = append(s.Steps, vectorStep{
				Op: "create", Shares: n.String(), Result: inputs[0].AtomsString(),
				Ledger: l, Pending: p, Unclaimed: u, Supply: sup,
			})

			legs, err := Redeem(a, n)
			if err != nil {
				t.Fatal(err)
			}
			if err := ApplyRedeem(a, n, legs); err != nil {
				t.Fatal(err)
			}
			l, p, u, sup = record(a.Constituents[0], a.Supply)
			s.Steps = append(s.Steps, vectorStep{
				Op: "redeem", Shares: n.String(), Result: legs[0].AtomsString(),
				Ledger: l, Pending: p, Unclaimed: u, Supply: sup,
			})
		}
		file.Scenarios = append(file.Scenarios, s)
	}

	// Scenario: a multiplier-only issuer moves nothing.
	{
		c := constituent(t, "AAPLx", "1000000", "0", "0", 6)
		supply := big.NewInt(1000)
		s := vectorScenario{
			Name:    "multiplier only issuer",
			Purpose: "A Scaled UI multiplier change moves no raw units, so sync finds nothing. This is the xStocks case and the common one.",
			Scale:   6,
		}
		l, p, u, sup := record(c, supply)
		s.Steps = append(s.Steps, vectorStep{Op: "initial", Ledger: l, Pending: p, Unclaimed: u, Supply: sup})

		result, err := Sync(c, atoms(t, "1000000", 6), epoch.Add(30*24*time.Hour), vestWindow)
		if err != nil {
			t.Fatal(err)
		}
		l, p, u, sup = record(result.After, supply)
		s.Steps = append(s.Steps, vectorStep{
			Op: "sync", AtSeconds: int64((30 * 24 * time.Hour).Seconds()), Actual: "1000000",
			Kind: string(result.Kind), Ledger: l, Pending: p, Unclaimed: u, Supply: sup,
		})
		file.Scenarios = append(file.Scenarios, s)
	}

	return file
}

func TestGoldenVectors(t *testing.T) {
	built := buildVectors(t)

	if *update {
		body, err := json.MarshalIndent(built, "", "  ")
		if err != nil {
			t.Fatal(err)
		}
		if err := os.MkdirAll(filepath.Dir(goldenPath), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(goldenPath, append(body, '\n'), 0o644); err != nil {
			t.Fatal(err)
		}
		t.Logf("wrote %s with %d scenarios", goldenPath, len(built.Scenarios))
		return
	}

	raw, err := os.ReadFile(goldenPath)
	if err != nil {
		t.Fatalf("read %s: %v (generate it with: go test ./internal/basket -update)", goldenPath, err)
	}
	var want vectorFile
	if err := json.Unmarshal(raw, &want); err != nil {
		t.Fatal(err)
	}
	if want.VestWindowSeconds != built.VestWindowSeconds {
		t.Fatalf("vest window changed: was %ds, now %ds", want.VestWindowSeconds, built.VestWindowSeconds)
	}
	if len(want.Scenarios) != len(built.Scenarios) {
		t.Fatalf("golden holds %d scenarios, the build produced %d", len(want.Scenarios), len(built.Scenarios))
	}
	for i, expected := range want.Scenarios {
		got := built.Scenarios[i]
		t.Run(expected.Name, func(t *testing.T) {
			if len(got.Steps) != len(expected.Steps) {
				t.Fatalf("step count changed: was %d, now %d", len(expected.Steps), len(got.Steps))
			}
			for j, step := range expected.Steps {
				if got.Steps[j] != step {
					t.Errorf("step %d (%s) changed:\n  was %+v\n  now %+v", j, step.Op, step, got.Steps[j])
				}
			}
		})
	}
}
