package gateway

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"

	"github.com/BeyndtechArc/Seametry/server/internal/gateway/api"
)

type recordedHallTranscript struct {
	Note      string                 `json:"note"`
	Producer  recordedHallProducer   `json:"producer"`
	NotShown  []string               `json:"not_shown"`
	Scenarios []recordedHallScenario `json:"scenarios"`
}

type recordedHallProducer struct {
	Kind        string  `json:"kind"`
	Description string  `json:"description"`
	ProgramID   string  `json:"program_id"`
	Cluster     *string `json:"cluster"`
	Signatures  bool    `json:"signatures"`
}

type recordedHallScenario struct {
	ID          string             `json:"id"`
	Title       string             `json:"title"`
	Shows       string             `json:"shows"`
	DoesNotShow string             `json:"does_not_show"`
	Steps       []recordedHallMove `json:"steps"`
}

type recordedHallMove struct {
	Actor     string             `json:"actor"`
	Action    string             `json:"action"`
	Result    string             `json:"result"`
	Reason    string             `json:"reason"`
	Signature string             `json:"signature"`
	State     *recordedHallState `json:"state"`
}

type recordedHallState struct {
	Supply uint64                 `json:"supply"`
	Legs   []recordedHallLeg      `json:"legs"`
	Holder recordedHallHolderView `json:"holder"`
}

type recordedHallLeg struct {
	Stock       string `json:"stock"`
	HallBalance uint64 `json:"hall_balance"`
	Ledger      uint64 `json:"ledger"`
	Pending     uint64 `json:"pending"`
	Unclaimed   uint64 `json:"unclaimed"`
}

type recordedHallHolderView struct {
	Shares        uint64   `json:"shares"`
	Claims        []uint64 `json:"claims"`
	StockBalances []uint64 `json:"stock_balances"`
}

func (s Server) GetHallDemonstration(_ context.Context, request api.GetHallDemonstrationRequestObject) (api.GetHallDemonstrationResponseObject, error) {
	name := "transcript.json"
	if request.Params.Cluster == api.GetHallDemonstrationParamsClusterDevnet {
		name = "transcript-devnet.json"
	}
	path := filepath.Join(s.HallEvidenceDir, name)
	raw, err := os.ReadFile(path)
	if err != nil {
		problem := gatewayProblem(http.StatusServiceUnavailable, "Hall demonstration unavailable", fmt.Sprintf("reading %s: %v", path, err))
		return api.GetHallDemonstrationdefaultApplicationProblemPlusJSONResponse{Body: problem, StatusCode: problem.Status}, nil
	}
	var recorded recordedHallTranscript
	if err := json.Unmarshal(raw, &recorded); err != nil {
		problem := gatewayProblem(http.StatusInternalServerError, "Hall demonstration is malformed", fmt.Sprintf("decoding %s: %v", path, err))
		return api.GetHallDemonstrationdefaultApplicationProblemPlusJSONResponse{Body: problem, StatusCode: problem.Status}, nil
	}

	transcript, err := toHallTranscript(recorded)
	if err != nil {
		problem := gatewayProblem(http.StatusInternalServerError, "Hall demonstration is malformed", fmt.Sprintf("converting %s: %v", path, err))
		return api.GetHallDemonstrationdefaultApplicationProblemPlusJSONResponse{Body: problem, StatusCode: problem.Status}, nil
	}
	now := s.now()
	return api.GetHallDemonstration200JSONResponse{
		Data: transcript,
		Meta: api.Meta{AsOf: now, ServedAt: now, Completeness: api.Complete},
	}, nil
}

func toHallTranscript(recorded recordedHallTranscript) (api.HallTranscript, error) {
	producerKind := api.HallProducerKind(recorded.Producer.Kind)
	if !producerKind.Valid() {
		return api.HallTranscript{}, fmt.Errorf("producer kind %q is not in the API contract", recorded.Producer.Kind)
	}
	out := api.HallTranscript{
		Note:     recorded.Note,
		NotShown: recorded.NotShown,
		Producer: api.HallProducer{
			Kind: producerKind, Description: recorded.Producer.Description,
			ProgramId: recorded.Producer.ProgramID, Cluster: recorded.Producer.Cluster,
			Signatures: recorded.Producer.Signatures,
		},
		Scenarios: make([]api.HallScene, len(recorded.Scenarios)),
	}
	for i, scenario := range recorded.Scenarios {
		wireScenario := api.HallScene{
			Id: scenario.ID, Title: scenario.Title, Shows: scenario.Shows,
			DoesNotShow: scenario.DoesNotShow, Steps: make([]api.HallMove, len(scenario.Steps)),
		}
		for j, move := range scenario.Steps {
			result := api.HallMoveResult(move.Result)
			if !result.Valid() {
				return api.HallTranscript{}, fmt.Errorf("scenario %q step %d result %q is not in the API contract", scenario.ID, j, move.Result)
			}
			wireMove := api.HallMove{Actor: move.Actor, Action: move.Action, Result: result}
			if move.Reason != "" {
				wireMove.Reason = stringPointer(move.Reason)
			}
			if move.Signature != "" {
				wireMove.Signature = stringPointer(move.Signature)
			}
			if move.State != nil {
				state := api.HallState{
					Supply: strconv.FormatUint(move.State.Supply, 10),
					Legs:   make([]api.HallLegState, len(move.State.Legs)),
					Holder: api.HallHolderView{
						Shares:        strconv.FormatUint(move.State.Holder.Shares, 10),
						Claims:        uintsToStrings(move.State.Holder.Claims),
						StockBalances: uintsToStrings(move.State.Holder.StockBalances),
					},
				}
				for k, leg := range move.State.Legs {
					state.Legs[k] = api.HallLegState{
						Stock: leg.Stock, HallBalance: strconv.FormatUint(leg.HallBalance, 10),
						Ledger: strconv.FormatUint(leg.Ledger, 10), Pending: strconv.FormatUint(leg.Pending, 10),
						Unclaimed: strconv.FormatUint(leg.Unclaimed, 10),
					}
				}
				wireMove.State = &state
			}
			wireScenario.Steps[j] = wireMove
		}
		out.Scenarios[i] = wireScenario
	}
	return out, nil
}

func uintsToStrings(values []uint64) []string {
	out := make([]string, len(values))
	for i, value := range values {
		out[i] = strconv.FormatUint(value, 10)
	}
	return out
}
