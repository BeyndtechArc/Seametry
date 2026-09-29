package gateway

import (
	"context"
	"time"

	"github.com/BeyndtechArc/Seametry/server/internal/gateway/api"
	"github.com/BeyndtechArc/Seametry/server/internal/policy"
)

func (Server) GetPolicy(ctx context.Context, request api.GetPolicyRequestObject) (api.GetPolicyResponseObject, error) {
	doc := policy.Default()
	if request.Version != doc.Version {
		return api.GetPolicydefaultApplicationProblemPlusJSONResponse{
			StatusCode: 404,
			Body: api.Problem{
				Type: problemTypeUnspecified, Title: "Not found", Status: 404,
				Detail: "No policy document at version " + request.Version + ". This process serves " + doc.Version + "; only that version is known to it right now.",
			},
		}, nil
	}
	now := time.Now().UTC()
	return api.GetPolicy200JSONResponse{
		Data: api.PolicyDocument{
			Version:                 doc.Version,
			AcceptedGrades:          doc.AcceptedGrades,
			AllowedHookPrograms:     doc.AllowedHookPrograms,
			BlockOnUnknownExtension: doc.BlockOnUnknownExtension,
			BlockOnIssuerHalt:       doc.BlockOnIssuerHalt,
			DepthReferenceUsdc:      int(doc.DepthReferenceUSDC),
			DepthCeilingBps:         int(doc.DepthCeilingBps),
		},
		Meta: api.Meta{ServedAt: now, AsOf: now, Completeness: api.Complete},
	}, nil
}

// reasonCodeMeanings is every server/internal/policy.Code constant's fixed
// sentence, genericized: several of policy.go's own Fact strings carry a
// parameter (a size, a basis-point figure, an extension name), and a reason
// code's meaning (docs/prd/API.md section 4.7: "a client must show a code
// it does not recognise, never map it to one it does") is what the code
// always means, not one decision's filled-in template. A code missing here
// is a test failure (policy_handlers_test.go), not a silent gap: a reader
// asking what an unlisted code means is exactly the case section 4.7 exists
// to prevent.
var reasonCodeMeanings = map[policy.Code]string{
	policy.CodeUngraded:             "This instrument's claim has not been classified, so what it legally represents is unknown.",
	policy.CodePaused:               "The issuer has paused all movement of this.",
	policy.CodeNonTransferable:      "This cannot be transferred at all.",
	policy.CodeFrozenByDefault:      "A new account for this starts frozen until the issuer approves it, so a recipient may be unable to receive.",
	policy.CodeActiveHookUnknown:    "This checks who may receive it, using a program Seametry has not read.",
	policy.CodeQuarantined:          "An expected corporate action and the observed state disagree, so this instrument is held back until they are reconciled.",
	policy.CodeMultiplierUnresolved: "The quantity you appear to hold could not be resolved from this instrument's configuration.",
	policy.CodeNoRoute:              "No route to buy this at the queried size was found.",
	policy.CodeNotTradable:          "The aggregator will not trade this token.",
	policy.CodeRefusalUnknown:       "The aggregator refused with a reason Seametry does not recognise.",
	policy.CodeDepthAboveCeiling:    "Buying at the policy's reference size realises a rate worse than the smallest size that priced, by more than the policy's ceiling.",
	policy.CodeDepthNotObserved:     "Executable depth has not been observed at the policy's reference size.",
	policy.CodeUnknownExtension:     "This carries an issuer control Seametry does not yet decode.",
	policy.CodeHaltedByIssuer:       "The issuer has halted trading in this.",
	policy.CodePermanentDelegate:    "The issuer can take this back from any wallet.",
	policy.CodeFreezeAuthority:      "The issuer can freeze this where it sits.",
	policy.CodePausable:             "The issuer can pause all movement of this.",
	policy.CodeHookCanBeEnabled:     "The issuer can switch on a check of who may receive this.",
	policy.CodeMultiplierAuthority:  "The issuer can change how many of these you appear to hold.",
	policy.CodeSupplyMutable:        "The issuer can create more of these.",
	policy.CodeActivationPending:    "A change to the quantity you appear to hold is scheduled and has not taken effect yet.",
	policy.CodeNaiveReaderWrong:     "The field named multiplier is behind the live value here, so anything reading that field alone is one corporate action out of date.",
}

func (Server) ListReasonCodes(ctx context.Context, request api.ListReasonCodesRequestObject) (api.ListReasonCodesResponseObject, error) {
	data := make([]api.ReasonCodeEntry, 0, len(reasonCodeMeanings))
	for code, meaning := range reasonCodeMeanings {
		data = append(data, api.ReasonCodeEntry{Code: string(code), Meaning: meaning})
	}
	now := time.Now().UTC()
	return api.ListReasonCodes200JSONResponse{
		Data: data,
		Meta: api.Meta{ServedAt: now, AsOf: now, Completeness: api.Complete},
	}, nil
}
