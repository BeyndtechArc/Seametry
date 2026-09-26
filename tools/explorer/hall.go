package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strconv"
	"strings"
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
