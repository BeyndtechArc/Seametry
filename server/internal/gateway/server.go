package gateway

import (
	"context"
	"time"

	"github.com/BeyndtechArc/Seametry/server/internal/gateway/api"
)

// Server implements api.StrictServerInterface. Every operation but GetStatus
// answers 501 until the build step named in its stub lands; docs/prd/API.md
// section 12 is the order of record, kept current there, not duplicated into
// a comment on each method that would drift from it.
type Server struct{}

var _ api.StrictServerInterface = Server{}

// GetStatus is Seametry's own freshness, held to the standard it holds
// sources to (docs/prd/API.md section 5.1). completeness is complete, not
// partial: with no observer running yet, an empty sources list is the whole
// truth, not a gap in it. ledger_lag_seconds is honestly 0 for the same
// reason: nothing yet exists for Seametry's copy to lag behind.
func (Server) GetStatus(ctx context.Context, request api.GetStatusRequestObject) (api.GetStatusResponseObject, error) {
	now := time.Now().UTC()
	return api.GetStatus200JSONResponse{
		Data: api.StatusReport{
			LedgerLagSeconds: 0,
			Sources: []struct {
				AgeSeconds    *int                                 `json:"age_seconds,omitempty"`
				EvidenceState api.StatusReportSourcesEvidenceState `json:"evidence_state"`
				Source        string                               `json:"source"`
			}{},
		},
		Meta: api.Meta{
			ServedAt:     now,
			AsOf:         now,
			Completeness: api.Complete,
		},
	}, nil
}

func (Server) ListAlloys(ctx context.Context, request api.ListAlloysRequestObject) (api.ListAlloysResponseObject, error) {
	return api.ListAlloysdefaultApplicationProblemPlusJSONResponse{Body: notBuilt("ListAlloys", "A5"), StatusCode: 501}, nil
}

func (Server) GetAlloy(ctx context.Context, request api.GetAlloyRequestObject) (api.GetAlloyResponseObject, error) {
	return api.GetAlloydefaultApplicationProblemPlusJSONResponse{Body: notBuilt("GetAlloy", "A5"), StatusCode: 501}, nil
}

func (Server) GetAlloyNav(ctx context.Context, request api.GetAlloyNavRequestObject) (api.GetAlloyNavResponseObject, error) {
	return api.GetAlloyNavdefaultApplicationProblemPlusJSONResponse{Body: notBuilt("GetAlloyNav", "A5"), StatusCode: 501}, nil
}

func (Server) GetAlloyStrikeCost(ctx context.Context, request api.GetAlloyStrikeCostRequestObject) (api.GetAlloyStrikeCostResponseObject, error) {
	return api.GetAlloyStrikeCostdefaultApplicationProblemPlusJSONResponse{Body: notBuilt("GetAlloyStrikeCost", "A5"), StatusCode: 501}, nil
}

func (Server) GetAlloyMeltProceeds(ctx context.Context, request api.GetAlloyMeltProceedsRequestObject) (api.GetAlloyMeltProceedsResponseObject, error) {
	return api.GetAlloyMeltProceedsdefaultApplicationProblemPlusJSONResponse{Body: notBuilt("GetAlloyMeltProceeds", "A5"), StatusCode: 501}, nil
}

func (Server) ListAnchorKeys(ctx context.Context, request api.ListAnchorKeysRequestObject) (api.ListAnchorKeysResponseObject, error) {
	return api.ListAnchorKeysdefaultApplicationProblemPlusJSONResponse{Body: notBuilt("ListAnchorKeys", "A4"), StatusCode: 501}, nil
}

func (Server) GetBatch(ctx context.Context, request api.GetBatchRequestObject) (api.GetBatchResponseObject, error) {
	return api.GetBatchdefaultApplicationProblemPlusJSONResponse{Body: notBuilt("GetBatch", "A4"), StatusCode: 501}, nil
}

func (Server) ListFindings(ctx context.Context, request api.ListFindingsRequestObject) (api.ListFindingsResponseObject, error) {
	return api.ListFindingsdefaultApplicationProblemPlusJSONResponse{Body: notBuilt("ListFindings", "A3"), StatusCode: 501}, nil
}

func (Server) GetFinding(ctx context.Context, request api.GetFindingRequestObject) (api.GetFindingResponseObject, error) {
	return api.GetFindingdefaultApplicationProblemPlusJSONResponse{Body: notBuilt("GetFinding", "A3"), StatusCode: 501}, nil
}

func (Server) EvaluateFormula(ctx context.Context, request api.EvaluateFormulaRequestObject) (api.EvaluateFormulaResponseObject, error) {
	return api.EvaluateFormuladefaultApplicationProblemPlusJSONResponse{Body: notBuilt("EvaluateFormula", "F1"), StatusCode: 501}, nil
}

func (Server) GetHallDemonstration(ctx context.Context, request api.GetHallDemonstrationRequestObject) (api.GetHallDemonstrationResponseObject, error) {
	return api.GetHallDemonstrationdefaultApplicationProblemPlusJSONResponse{Body: notBuilt("GetHallDemonstration", "A5"), StatusCode: 501}, nil
}

func (Server) ListInstruments(ctx context.Context, request api.ListInstrumentsRequestObject) (api.ListInstrumentsResponseObject, error) {
	return api.ListInstrumentsdefaultApplicationProblemPlusJSONResponse{Body: notBuilt("ListInstruments", "A3"), StatusCode: 501}, nil
}

func (Server) GetInstrument(ctx context.Context, request api.GetInstrumentRequestObject) (api.GetInstrumentResponseObject, error) {
	return api.GetInstrumentdefaultApplicationProblemPlusJSONResponse{Body: notBuilt("GetInstrument", "A3"), StatusCode: 501}, nil
}

func (Server) GetInstrumentAdmissibility(ctx context.Context, request api.GetInstrumentAdmissibilityRequestObject) (api.GetInstrumentAdmissibilityResponseObject, error) {
	return api.GetInstrumentAdmissibilitydefaultApplicationProblemPlusJSONResponse{Body: notBuilt("GetInstrumentAdmissibility", "A3"), StatusCode: 501}, nil
}

func (Server) GetInstrumentDepth(ctx context.Context, request api.GetInstrumentDepthRequestObject) (api.GetInstrumentDepthResponseObject, error) {
	return api.GetInstrumentDepthdefaultApplicationProblemPlusJSONResponse{Body: notBuilt("GetInstrumentDepth", "A3"), StatusCode: 501}, nil
}

func (Server) GetPolicy(ctx context.Context, request api.GetPolicyRequestObject) (api.GetPolicyResponseObject, error) {
	return api.GetPolicydefaultApplicationProblemPlusJSONResponse{Body: notBuilt("GetPolicy", "A3"), StatusCode: 501}, nil
}

func (Server) ListReasonCodes(ctx context.Context, request api.ListReasonCodesRequestObject) (api.ListReasonCodesResponseObject, error) {
	return api.ListReasonCodesdefaultApplicationProblemPlusJSONResponse{Body: notBuilt("ListReasonCodes", "A3"), StatusCode: 501}, nil
}

func (Server) GetReceipt(ctx context.Context, request api.GetReceiptRequestObject) (api.GetReceiptResponseObject, error) {
	return api.GetReceiptdefaultApplicationProblemPlusJSONResponse{Body: notBuilt("GetReceipt", "A4"), StatusCode: 501}, nil
}

func (Server) StreamEvents(ctx context.Context, request api.StreamEventsRequestObject) (api.StreamEventsResponseObject, error) {
	return api.StreamEventsdefaultApplicationProblemPlusJSONResponse{Body: notBuilt("StreamEvents", "A5"), StatusCode: 501}, nil
}
