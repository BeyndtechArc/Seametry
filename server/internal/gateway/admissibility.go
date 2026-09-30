package gateway

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/BeyndtechArc/Seametry/server/internal/gateway/api"
	"github.com/BeyndtechArc/Seametry/server/internal/policy"
)

// admissibilityGrade is docs/prd/API.md's stated assumption: nothing in this
// codebase classifies grade from real data yet, and Storm chose to match
// server/cmd/explorer/main.go's own hardcoded "certificate" rather than
// report every instrument ungraded, which would block all of them on
// CodeUngraded before real classification exists. Revisit together with
// that file's own hardcode when grade is decoded for real.
const admissibilityGrade = "certificate"

// evaluate is server/cmd/explorer/main.go's decide(), read from what A2
// persisted instead of from fixture files: the same policy.FromRegistry,
// policy.DepthFromCurve and policy.Evaluate calls, so a live decision and
// the Explorer's own static one agree whenever they see the same facts.
// halted and quarantined are false: neither has a real source yet (no
// adapter captures an issuer's own halt announcement, and no corporate
// action calendar exists to quarantine against), unlike the Explorer's
// static build, which hand-asserts halted=true for two demonstration
// symbols purely to show what that BLOCK looks like. The live API does not
// fabricate a signal nothing has actually observed.
func (s Server) evaluate(ctx context.Context, d *decodedMint, mint string, asOf time.Time) (policy.Result, error) {
	var p struct {
		Symbol string `json:"symbol"`
		Slot   uint64 `json:"slot"`
	}
	json.Unmarshal(d.Observation.Payload, &p)

	input, err := policy.FromRegistry(p.Symbol, mint, admissibilityGrade, d.Mint, asOf, p.Slot, false, false)
	if err != nil {
		return policy.Result{}, fmt.Errorf("building policy input for %s: %w", mint, err)
	}

	curve, err := s.buildCurve(ctx, mint, int32(d.Mint.Decimals), asOf)
	if err != nil {
		return policy.Result{}, err
	}
	doc := policy.Default()
	if input.Depth, err = policy.DepthFromCurve(curve, doc.DepthReferenceUSDC); err != nil {
		return policy.Result{}, err
	}

	return policy.Evaluate(doc, input)
}

// DecisionView is the wire shape of a policy result. Exported so the
// Explorer's static admissions snapshot is built by the same mapping the live
// endpoint uses, and switching a reader from one to the other changes nothing.
func DecisionView(result policy.Result) api.Decision {
	d := api.Decision{
		Decision:      api.DecisionDecision(result.Decision),
		PolicyVersion: result.PolicyVersion,
		InputDigest:   result.InputDigest,
		Reasons:       make([]api.Reason, len(result.Reasons)),
	}
	for i, r := range result.Reasons {
		d.Reasons[i] = api.Reason{Code: string(r.Code), Severity: api.ReasonSeverity(r.Severity), Fact: r.Fact}
	}
	return d
}

func (s Server) GetInstrumentAdmissibility(ctx context.Context, request api.GetInstrumentAdmissibilityRequestObject) (api.GetInstrumentAdmissibilityResponseObject, error) {
	asOf := resolveAsOf(request.Params.AsOf)
	now := time.Now().UTC()
	d, ok, err := s.loadMint(ctx, request.Mint, asOf)
	if err != nil {
		return nil, err
	}
	if !ok {
		return api.GetInstrumentAdmissibilitydefaultApplicationProblemPlusJSONResponse{
			StatusCode: 404,
			Body: api.Problem{
				Type: problemTypeUnspecified, Title: "Not found", Status: 404,
				Detail: fmt.Sprintf("No observation of mint %s as of %s.", request.Mint, asOf.Format(time.RFC3339)),
			},
		}, nil
	}
	result, err := s.evaluate(ctx, d, request.Mint, asOf)
	if err != nil {
		return nil, err
	}
	return api.GetInstrumentAdmissibility200JSONResponse{
		Data: DecisionView(result),
		Meta: api.Meta{ServedAt: now, AsOf: asOf, Completeness: api.Complete},
	}, nil
}
