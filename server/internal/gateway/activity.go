package gateway

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/BeyndtechArc/Seametry/server/internal/execution"
	"github.com/BeyndtechArc/Seametry/server/internal/gateway/api"
	"github.com/BeyndtechArc/Seametry/server/internal/growth"
	"github.com/BeyndtechArc/Seametry/server/internal/identity"
)

// ActivityReport is Execution's activity record, as the Gateway needs it.
type ActivityReport interface {
	RecordQuote(ctx context.Context, quote execution.Quote) error
	RecordSubmission(ctx context.Context, submission execution.Submission) error
	RecordFunnel(ctx context.Context, deployment string, events []execution.FunnelEvent, received time.Time) error
	History(ctx context.Context, wallets []string) ([]execution.HistoryQuote, error)
}

// WithActivity gives the Gateway the activity record. Without one, the
// activity operations answer 503 rather than accepting reports they cannot keep.
func (s Server) WithActivity(report ActivityReport) Server {
	s.Activity = report
	return s
}

// VisitCounter is Growth's visit count, as the Gateway needs it.
// *growth.Visits satisfies it.
type VisitCounter interface {
	Count(ctx context.Context, at time.Time, landingPath, refCode string) error
}

// WithVisits gives the Gateway Growth's visit count. Without one, a visit
// report answers 503.
func (s Server) WithVisits(visits VisitCounter) Server {
	s.Visits = visits
	return s
}

// AccountJoiner is Growth's person record, as the Gateway needs it.
// *growth.People satisfies it.
type AccountJoiner interface {
	Join(ctx context.Context, subject identity.Subject, now time.Time) error
}

// joinTimeout bounds a join that runs after its request has gone.
const joinTimeout = 5 * time.Second

// JoinAccounts tells Growth about each verified account a request arrives
// with. It sits here because no single route sees every account: the web
// never calls GET /v1/me. The join runs beside the request, not inside it,
// so a slow or failing record can never delay or fail a trade.
func JoinAccounts(next http.Handler, joiner AccountJoiner) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if subject, ok := identity.SubjectFromContext(r.Context()); ok {
			go func() {
				ctx, cancel := context.WithTimeout(context.Background(), joinTimeout)
				defer cancel()
				if err := joiner.Join(ctx, subject, time.Now()); err != nil {
					slog.Warn("seametry: joining an account to Growth", "error", err.Error())
				}
			}()
		}
		next.ServeHTTP(w, r)
	})
}

const serviceSecretHeader = "X-Seametry-Service-Secret"

// ServiceSecret admits a request under /v1/internal/ only when it carries
// the secret the web deployment holds. The paths are on the public Gateway,
// so the secret is the whole of their protection: compared in constant
// time, and an unset secret refuses everything instead of admitting it.
func ServiceSecret(secret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !strings.HasPrefix(r.URL.Path, "/v1/internal/") {
				next.ServeHTTP(w, r)
				return
			}
			status, title, detail := 0, "", ""
			switch {
			case secret == "":
				status, title, detail = http.StatusServiceUnavailable, "Activity recording is not configured", "SEAMETRY_ACTIVITY_INGEST_SECRET is not set on this Gateway, so it accepts no internal report."
			case subtle.ConstantTimeCompare([]byte(r.Header.Get(serviceSecretHeader)), []byte(secret)) != 1:
				status, title, detail = http.StatusUnauthorized, "Service secret refused", r.URL.Path+" needs the "+serviceSecretHeader+" header the web deployment holds as ACTIVITY_INGEST_SECRET."
			default:
				next.ServeHTTP(w, r)
				return
			}
			w.Header().Set("Content-Type", "application/problem+json")
			w.Header().Set("Cache-Control", "no-store")
			w.WriteHeader(status)
			json.NewEncoder(w).Encode(gatewayProblem(status, title, detail))
		})
	}
}

// activityProblem maps what the record answered to a status and a sentence
// the web route can log: a refused report is the sender's to fix, anything
// else is the Gateway's.
func activityProblem(operation string, err error) (int, api.Problem) {
	var invalid execution.Invalid
	switch {
	case errors.As(err, &invalid):
		return http.StatusBadRequest, gatewayProblem(http.StatusBadRequest, "Activity report refused", operation+": "+invalid.Reason)
	case errors.Is(err, execution.ErrUnknownLeg):
		return http.StatusNotFound, gatewayProblem(http.StatusNotFound, "No recorded leg", operation+": no recorded leg carries this message digest; its quote report was lost or never sent.")
	default:
		return http.StatusInternalServerError, gatewayProblem(http.StatusInternalServerError, "Activity record unavailable", operation+": "+err.Error())
	}
}

func unconfigured(operation string) api.Problem {
	return gatewayProblem(http.StatusServiceUnavailable, "Activity record unavailable", operation+" has no activity record on this Gateway: it was started without one.")
}

func optional(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func activityAmount(value api.Amount) execution.Amount {
	return execution.Amount{Atoms: value.Atoms, Scale: value.Scale}
}

func (s Server) RecordActivityQuote(ctx context.Context, request api.RecordActivityQuoteRequestObject) (api.RecordActivityQuoteResponseObject, error) {
	if s.Activity == nil {
		return api.RecordActivityQuotedefaultApplicationProblemPlusJSONResponse{Body: unconfigured("RecordActivityQuote"), StatusCode: http.StatusServiceUnavailable}, nil
	}
	body := request.Body
	quote := execution.Quote{
		ID: body.Id, Wallet: body.Wallet, Network: string(body.Network), Kind: string(body.Kind),
		Subject: optional(body.Subject), TemplateID: optional(body.TemplateId), PlanSize: body.PlanSize,
		Deployment: string(body.Deployment), PreparedAt: body.PreparedAt,
	}
	if body.Refusal != nil {
		quote.Refusal = &execution.Refusal{Status: body.Refusal.Status, Text: body.Refusal.Text}
	}
	if touch := body.FirstTouch; touch != nil {
		quote.FirstTouch = &execution.FirstTouch{
			ReferrerHost: optional(touch.ReferrerHost), LandingPath: optional(touch.LandingPath),
			UTMSource: optional(touch.UtmSource), UTMMedium: optional(touch.UtmMedium), UTMCampaign: optional(touch.UtmCampaign),
			UTMContent: optional(touch.UtmContent), UTMTerm: optional(touch.UtmTerm), RefCode: optional(touch.RefCode),
		}
	}
	if stated := body.Conditions; stated != nil {
		conditions := &execution.Conditions{PolicyVersion: stated.PolicyVersion, SnapshotAt: stated.SnapshotAt}
		for _, leg := range stated.Legs {
			condition := execution.LegCondition{Mint: leg.Mint, Decision: optional(leg.Decision), Reasons: []execution.ConditionReason{}}
			for _, reason := range leg.Reasons {
				condition.Reasons = append(condition.Reasons, execution.ConditionReason{Code: reason.Code, Severity: reason.Severity})
			}
			conditions.Legs = append(conditions.Legs, condition)
		}
		quote.Conditions = conditions
	}
	for _, leg := range body.Legs {
		quote.Legs = append(quote.Legs, execution.Leg{
			ID: leg.Id, Mint: leg.Mint, Symbol: leg.Symbol, In: activityAmount(leg.In), Out: activityAmount(leg.Out), Floor: activityAmount(leg.Floor),
			RoutingFeeBps: leg.RoutingFeeBps, TipOffsetBps: leg.TipOffsetBps, SimulatedFeeAtoms: leg.SimulatedFeeAtoms,
			TipLamports: leg.TipLamports, Landing: string(leg.Landing), LastValidBlockHeight: leg.LastValidBlockHeight,
			MessageSHA256: leg.MessageSha256,
		})
	}
	if err := s.Activity.RecordQuote(ctx, quote); err != nil {
		status, problem := activityProblem("RecordActivityQuote", err)
		return api.RecordActivityQuotedefaultApplicationProblemPlusJSONResponse{Body: problem, StatusCode: status}, nil
	}
	return api.RecordActivityQuote204Response{}, nil
}

func (s Server) RecordActivitySubmission(ctx context.Context, request api.RecordActivitySubmissionRequestObject) (api.RecordActivitySubmissionResponseObject, error) {
	if s.Activity == nil {
		return api.RecordActivitySubmissiondefaultApplicationProblemPlusJSONResponse{Body: unconfigured("RecordActivitySubmission"), StatusCode: http.StatusServiceUnavailable}, nil
	}
	body := request.Body
	err := s.Activity.RecordSubmission(ctx, execution.Submission{
		MessageSHA256: body.MessageSha256, Signature: optional(body.Signature), SubmittedAt: body.SubmittedAt,
		Result: string(body.Result), Text: optional(body.Text),
	})
	if err != nil {
		status, problem := activityProblem("RecordActivitySubmission", err)
		return api.RecordActivitySubmissiondefaultApplicationProblemPlusJSONResponse{Body: problem, StatusCode: status}, nil
	}
	return api.RecordActivitySubmission204Response{}, nil
}

func (s Server) RecordActivityFunnel(ctx context.Context, request api.RecordActivityFunnelRequestObject) (api.RecordActivityFunnelResponseObject, error) {
	if s.Activity == nil {
		return api.RecordActivityFunneldefaultApplicationProblemPlusJSONResponse{Body: unconfigured("RecordActivityFunnel"), StatusCode: http.StatusServiceUnavailable}, nil
	}
	events := make([]execution.FunnelEvent, 0, len(request.Body.Events))
	for _, event := range request.Body.Events {
		recorded := execution.FunnelEvent{Kind: event.Kind, Wallet: optional(event.Wallet)}
		if event.QuoteId != nil {
			id := [16]byte(*event.QuoteId)
			recorded.QuoteID = &id
		}
		events = append(events, recorded)
	}
	if err := s.Activity.RecordFunnel(ctx, string(request.Body.Deployment), events, s.Now()); err != nil {
		status, problem := activityProblem("RecordActivityFunnel", err)
		return api.RecordActivityFunneldefaultApplicationProblemPlusJSONResponse{Body: problem, StatusCode: status}, nil
	}
	return api.RecordActivityFunnel204Response{}, nil
}

// CountActivityVisit adds one production session to Growth's count. A
// preview or development session is accepted and not counted, so testing a
// deployment never reads as a visitor.
func (s Server) CountActivityVisit(ctx context.Context, request api.CountActivityVisitRequestObject) (api.CountActivityVisitResponseObject, error) {
	if s.Visits == nil {
		return api.CountActivityVisitdefaultApplicationProblemPlusJSONResponse{Body: unconfigured("CountActivityVisit"), StatusCode: http.StatusServiceUnavailable}, nil
	}
	if request.Body.Deployment != api.ActivityVisitDeploymentProduction {
		return api.CountActivityVisit204Response{}, nil
	}
	if err := s.Visits.Count(ctx, s.Now(), request.Body.LandingPath, optional(request.Body.RefCode)); err != nil {
		if errors.Is(err, growth.ErrVisitShape) {
			return api.CountActivityVisitdefaultApplicationProblemPlusJSONResponse{
				Body: gatewayProblem(http.StatusBadRequest, "Visit refused", "CountActivityVisit: "+err.Error()), StatusCode: http.StatusBadRequest,
			}, nil
		}
		return api.CountActivityVisitdefaultApplicationProblemPlusJSONResponse{
			Body: gatewayProblem(http.StatusInternalServerError, "Visit not counted", "CountActivityVisit: "+err.Error()), StatusCode: http.StatusInternalServerError,
		}, nil
	}
	return api.CountActivityVisit204Response{}, nil
}

func historyAmount(value *execution.Amount) *api.Amount {
	if value == nil {
		return nil
	}
	return &api.Amount{Atoms: value.Atoms, Scale: value.Scale}
}

func present(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

// GetMyActivity reads the record for the wallets the account token names,
// and only those: the account authority puts a wallet there once this
// account has signed for it, so no address typed by a caller is ever read.
func (s Server) GetMyActivity(ctx context.Context, request api.GetMyActivityRequestObject) (api.GetMyActivityResponseObject, error) {
	subject, ok := identity.SubjectFromContext(ctx)
	if !ok {
		return api.GetMyActivitydefaultApplicationProblemPlusJSONResponse{
			Body:       gatewayProblem(http.StatusUnauthorized, "Account token required", "GET /v1/me/activity requires a short-lived token issued by the Seametry account authority"),
			StatusCode: http.StatusUnauthorized,
		}, nil
	}
	if s.Activity == nil {
		return api.GetMyActivitydefaultApplicationProblemPlusJSONResponse{Body: unconfigured("GetMyActivity"), StatusCode: http.StatusServiceUnavailable}, nil
	}
	quotes, err := s.Activity.History(ctx, subject.Wallets)
	if err != nil {
		status, problem := activityProblem("GetMyActivity", err)
		return api.GetMyActivitydefaultApplicationProblemPlusJSONResponse{Body: problem, StatusCode: status}, nil
	}
	history := api.WalletHistory{Wallets: append([]string{}, subject.Wallets...), Executions: make([]api.WalletExecution, 0, len(quotes))}
	for _, quote := range quotes {
		recorded := api.WalletExecution{
			QuoteId: quote.ID, Wallet: quote.Wallet, Kind: api.WalletExecutionKind(quote.Kind), PlanSize: quote.PlanSize,
			PreparedAt: quote.PreparedAt.UTC(), Source: api.WalletExecutionSource(quote.Source),
			Subject: present(quote.Subject), TemplateId: present(quote.TemplateID), Legs: make([]api.WalletLeg, 0, len(quote.Legs)),
		}
		for _, leg := range quote.Legs {
			sent := api.WalletLeg{
				Id: leg.ID, Mint: leg.Mint, Symbol: present(leg.Symbol), Signature: leg.Signature, SubmittedAt: leg.SubmittedAt.UTC(),
				SubmitResult: api.WalletLegSubmitResult(leg.SubmitResult), Source: api.WalletLegSource(leg.Source),
				Spend: historyAmount(leg.In), ExpectedOut: historyAmount(leg.Out), Floor: historyAmount(leg.Floor),
			}
			if answer := leg.Chain; answer != nil {
				chain := &api.WalletLegChain{
					Outcome: api.WalletLegChainOutcome(answer.Outcome), ReconciledAt: answer.ReconciledAt.UTC(), TokenScale: answer.TokenScale,
					WalletUsdcDelta: present(answer.WalletUSDCDelta), WalletTokenDelta: present(answer.WalletTokenDelta),
				}
				if answer.BlockTime != nil {
					at := answer.BlockTime.UTC()
					chain.BlockTime = &at
				}
				sent.Chain = chain
			}
			recorded.Legs = append(recorded.Legs, sent)
		}
		history.Executions = append(history.Executions, recorded)
	}
	now := s.Now().UTC()
	return api.GetMyActivity200JSONResponse{
		Data: history,
		Meta: api.Meta{AsOf: now, ServedAt: now, Completeness: api.Complete},
	}, nil
}
