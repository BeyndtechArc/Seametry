package main

import (
	"encoding/json"
	"math/big"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/BeyndtechArc/Seametry/internal/amount"
	"github.com/BeyndtechArc/Seametry/internal/basket"
)

// Transcript is evidence/hall-demo/transcript.json: the Hall demonstration,
// recorded by whatever produced it. The page renders Producer beside every
// claim it makes, so a simulator run cannot be read as a cluster run.
type Transcript struct {
	Note     string   `json:"note"`
	Producer Producer `json:"producer"`
	NotShown []string `json:"not_shown"`
	Scenario []Scene  `json:"scenarios"`
}

type Producer struct {
	Kind        string  `json:"kind"`
	Description string  `json:"description"`
	ProgramID   string  `json:"program_id"`
	Cluster     *string `json:"cluster"`
	Signatures  bool    `json:"signatures"`
}

type Scene struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Shows       string `json:"shows"`
	DoesNotShow string `json:"does_not_show"`
	Steps       []Move `json:"steps"`
}

type Move struct {
	Actor  string     `json:"actor"`
	Action string     `json:"action"`
	Result string     `json:"result"`
	Reason string     `json:"reason"`
	State  *HallState `json:"state"`
}

type HallState struct {
	Supply uint64     `json:"supply"`
	Legs   []LegState `json:"legs"`
	Holder HolderView `json:"holder"`
}

type LegState struct {
	Stock       string `json:"stock"`
	HallBalance uint64 `json:"hall_balance"`
	Ledger      uint64 `json:"ledger"`
	Pending     uint64 `json:"pending"`
	Unclaimed   uint64 `json:"unclaimed"`
}

type HolderView struct {
	Shares        uint64   `json:"shares"`
	Claims        []uint64 `json:"claims"`
	StockBalances []uint64 `json:"stock_balances"`
}

// loadTranscript returns nil when no demonstration has been recorded, and the
// page says so instead of showing an empty table.
func loadTranscript() *Transcript {
	raw, err := os.ReadFile(filepath.Join("evidence", "hall-demo", "transcript.json"))
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		fail(err)
	}
	var t Transcript
	if err := json.Unmarshal(raw, &t); err != nil {
		fail(err)
	}
	return &t
}

// commas writes an integer with thousands separators. Amounts stay integers
// all the way to the page.
func commas(n uint64) string {
	digits := strconv.FormatUint(n, 10)
	var out strings.Builder
	for i, r := range digits {
		if i > 0 && (len(digits)-i)%3 == 0 {
			out.WriteByte(',')
		}
		out.WriteRune(r)
	}
	return out.String()
}

// Where states the producer in words, for the honesty label.
func (p Producer) Where() string {
	if p.Cluster == nil {
		return "a local simulator, not a cluster"
	}
	return "the " + *p.Cluster + " cluster"
}

// CostTable is what a strike costs and what a melt returns for a few share
// counts, computed by internal/basket from the alloy's state at founding. The
// page states no arithmetic of its own.
type CostTable struct {
	Stocks  []string
	Supply  uint64
	Ledgers []uint64
	Rows    []CostRow
}

// CostRow is one share count. In is what a strike takes, Out is what melting
// the same shares straight afterwards returns, and Kept is the difference, which
// stays with the Hall because every rounding favours it.
type CostRow struct {
	Shares uint64
	In     []uint64
	Out    []uint64
	Kept   []uint64
}

var costShares = []uint64{1, 7, 100, 1000, 12345}

// costScenario names the scenario whose last state the table is computed from.
// It is the dividend, because after it the ledger per share is not a whole
// number, and a whole ratio would hide every rounding the table exists to show.
const costScenario = "dividend"

// costTable reads the alloy's state from the founding scenario of the
// transcript, so the figures come from the recording and not from a constant.
func costTable(t *Transcript) *CostTable {
	if t == nil {
		return nil
	}
	var state *HallState
	for _, s := range t.Scenario {
		if s.ID == costScenario && len(s.Steps) > 0 {
			state = s.Steps[len(s.Steps)-1].State
		}
	}
	if state == nil {
		return nil
	}

	table := &CostTable{Supply: state.Supply}
	for _, leg := range state.Legs {
		table.Stocks = append(table.Stocks, leg.Stock)
		table.Ledgers = append(table.Ledgers, leg.Ledger)
	}
	for _, n := range costShares {
		row, err := costRow(state, n)
		if err != nil {
			fail(err)
		}
		table.Rows = append(table.Rows, row)
	}
	return table
}

func costRow(state *HallState, shares uint64) (CostRow, error) {
	const scale = 6
	row := CostRow{Shares: shares}
	supply := new(big.Int).SetUint64(state.Supply)
	n := new(big.Int).SetUint64(shares)
	after := new(big.Int).Add(supply, n)

	for _, leg := range state.Legs {
		c := basket.Constituent{Mint: leg.Stock, Ledger: units(leg.Ledger, scale)}
		in, err := basket.RequiredIn(c, n, supply)
		if err != nil {
			return row, err
		}
		// Melt the same shares against the alloy as the strike left it.
		struck := basket.Constituent{Mint: leg.Stock}
		if struck.Ledger, err = c.Ledger.Add(in); err != nil {
			return row, err
		}
		out, err := basket.Out(struck, n, after)
		if err != nil {
			return row, err
		}
		kept, err := in.Sub(out)
		if err != nil {
			return row, err
		}
		row.In = append(row.In, in.Atoms().Uint64())
		row.Out = append(row.Out, out.Atoms().Uint64())
		row.Kept = append(row.Kept, kept.Atoms().Uint64())
	}
	return row, nil
}

func units(atoms uint64, scale int32) amount.Amount {
	a, err := amount.FromBig(new(big.Int).SetUint64(atoms), scale)
	if err != nil {
		fail(err)
	}
	return a
}
