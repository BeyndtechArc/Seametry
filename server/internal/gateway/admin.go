package gateway

import (
	"context"
	"encoding/base64"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/BeyndtechArc/Seametry/server/internal/alert"
	"github.com/BeyndtechArc/Seametry/server/internal/execution"
	"github.com/BeyndtechArc/Seametry/server/internal/gateway/api"
	"github.com/BeyndtechArc/Seametry/server/internal/identity"
)

// AdminRecord is the activity record's aggregate reads, as the Admin needs them.
type AdminRecord interface {
	Overview(ctx context.Context, period execution.Period) (execution.Overview, error)
	Sources(ctx context.Context, period execution.Period) ([]execution.SourceTotals, error)
	Wallets(ctx context.Context, deployment string, after *execution.WalletCursor, limit int) (execution.WalletPage, error)
	RecentActivity(ctx context.Context, period execution.Period) ([]execution.RecordedRow, error)
}

// AdminOptIns is the consent record's counts, with addresses already masked.
type AdminOptIns interface {
	Summary(ctx context.Context, from, to time.Time, deployment string) (alert.OptInSummary, error)
}

// WithAdmin gives the Gateway the Admin's reads. Without them an admin's
// request answers 503; everyone else still gets the gate's 404.
func (s Server) WithAdmin(record AdminRecord, optIns AdminOptIns) Server {
	s.AdminRecord = record
	s.AdminOptIns = optIns
	return s
}

const adminPrefix = "/v1/admin"

// AdminGate admits a request under /v1/admin only for an account token
// whose email the provider verified and which the allowlist names, compared
// without case. Every other request there, signed out, signed in as anyone
// else, or with an unverified address, gets the same 404 as a path that
// does not exist, so the Admin's existence is not advertised. An empty
// allowlist admits no one. It must run inside the identity middleware,
// which is what puts a verified subject in the context; the email is read
// from the signed token, never from a header or a parameter.
func AdminGate(allowlist string) func(http.Handler) http.Handler {
	admins := map[string]bool{}
	for _, entry := range strings.Split(allowlist, ",") {
		if email := strings.ToLower(strings.TrimSpace(entry)); email != "" {
			admins[email] = true
		}
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != adminPrefix && !strings.HasPrefix(r.URL.Path, adminPrefix+"/") {
				next.ServeHTTP(w, r)
				return
			}
			subject, ok := identity.SubjectFromContext(r.Context())
			if !ok || !subject.EmailVerified || !admins[strings.ToLower(subject.Email)] {
				http.NotFound(w, r)
				return
			}
			w.Header().Set("Cache-Control", "no-store")
			next.ServeHTTP(w, r)
		})
	}
}

// AdminDefaultPeriod is the period read when a request names neither end.
const AdminDefaultPeriod = 30 * 24 * time.Hour

func (s Server) adminPeriod(from, to *time.Time, deployment *string) execution.Period {
	period := execution.Period{To: s.Now().UTC(), Deployment: "production"}
	if to != nil {
		period.To = to.UTC()
	}
	period.From = period.To.Add(-AdminDefaultPeriod)
	if from != nil {
		period.From = from.UTC()
	}
	if deployment != nil {
		period.Deployment = *deployment
	}
	return period
}

func apiPeriod(period execution.Period) api.AdminPeriod {
	return api.AdminPeriod{From: period.From, To: period.To, Deployment: api.AdminPeriodDeployment(period.Deployment)}
}

func usdc(atoms string) api.Amount {
	return api.Amount{Atoms: atoms, Scale: 6}
}

func (s Server) adminMeta() api.Meta {
	now := s.Now().UTC()
	return api.Meta{AsOf: now, ServedAt: now, Completeness: api.Complete}
}

func adminUnconfigured(operation string) api.Problem {
	return gatewayProblem(http.StatusServiceUnavailable, "Admin unavailable", operation+" has no activity record on this Gateway: it was started without one.")
}

func deploymentOf[T ~string](value *T) *string {
	if value == nil {
		return nil
	}
	text := string(*value)
	return &text
}

func (s Server) GetAdminOverview(ctx context.Context, request api.GetAdminOverviewRequestObject) (api.GetAdminOverviewResponseObject, error) {
	if s.AdminRecord == nil {
		return api.GetAdminOverviewdefaultApplicationProblemPlusJSONResponse{Body: adminUnconfigured("GetAdminOverview"), StatusCode: http.StatusServiceUnavailable}, nil
	}
	period := s.adminPeriod(request.Params.From, request.Params.To, deploymentOf(request.Params.Deployment))
	overview, err := s.AdminRecord.Overview(ctx, period)
	if err != nil {
		status, problem := activityProblem("GetAdminOverview", err)
		return api.GetAdminOverviewdefaultApplicationProblemPlusJSONResponse{Body: problem, StatusCode: status}, nil
	}
	funnel := overview.Funnel
	data := api.AdminOverview{
		Period: apiPeriod(period), Volume: usdc(overview.VolumeAtoms), FeeRevenue: usdc(overview.FeeAtoms), TipCost: usdc(overview.TipCostAtoms),
		LandedLegs: overview.LandedLegs, LastReconciledAt: overview.LastReconciledAt,
		Wallets: api.AdminWalletStates{
			Seen: overview.SeenWallets, SeenAndActivated: overview.SeenAndActivatedWallets, Activated: overview.ActivatedWallets,
			Active: overview.ActiveWallets, Returning: overview.ReturningWallets,
		},
		Funnel: api.AdminFunnel{
			Requested: funnel.Requested, Prepared: funnel.Prepared, Refused: funnel.Refused, ReviewOpened: funnel.ReviewOpened,
			SignatureRequested: funnel.SignatureRequested, SignatureDeclined: funnel.SignatureDeclined, SignatureFailed: funnel.SignatureFailed,
			SheetAbandoned: funnel.SheetAbandoned, Sent: funnel.Sent, Landed: funnel.Landed,
		},
		Refusals:    make([]api.AdminRefusal, 0, len(overview.Refusals)),
		Reliability: make([]api.AdminLandingPath, 0, len(overview.Reliability)),
	}
	for _, refusal := range overview.Refusals {
		data.Refusals = append(data.Refusals, api.AdminRefusal{Status: refusal.Status, Quotes: refusal.Quotes})
	}
	for _, path := range overview.Reliability {
		data.Reliability = append(data.Reliability, api.AdminLandingPath{
			Landing: path.Landing, Sent: path.Sent, Landed: path.Landed, Failed: path.Failed, Dropped: path.Dropped, Unanswered: path.Unanswered,
		})
	}
	return api.GetAdminOverview200JSONResponse{Data: data, Meta: s.adminMeta()}, nil
}

func (s Server) GetAdminSources(ctx context.Context, request api.GetAdminSourcesRequestObject) (api.GetAdminSourcesResponseObject, error) {
	if s.AdminRecord == nil {
		return api.GetAdminSourcesdefaultApplicationProblemPlusJSONResponse{Body: adminUnconfigured("GetAdminSources"), StatusCode: http.StatusServiceUnavailable}, nil
	}
	period := s.adminPeriod(request.Params.From, request.Params.To, deploymentOf(request.Params.Deployment))
	sources, err := s.AdminRecord.Sources(ctx, period)
	if err != nil {
		status, problem := activityProblem("GetAdminSources", err)
		return api.GetAdminSourcesdefaultApplicationProblemPlusJSONResponse{Body: problem, StatusCode: status}, nil
	}
	data := api.AdminSources{Period: apiPeriod(period), Sources: make([]api.AdminSource, 0, len(sources))}
	for _, source := range sources {
		data.Sources = append(data.Sources, api.AdminSource{
			Source: source.Source, SeenWallets: source.SeenWallets, ActivatedWallets: source.ActivatedWallets, ActiveWallets: source.ActiveWallets,
			Volume: usdc(source.VolumeAtoms), FeeRevenue: usdc(source.FeeAtoms),
		})
	}
	return api.GetAdminSources200JSONResponse{Data: data, Meta: s.adminMeta()}, nil
}

func (s Server) GetAdminWallets(ctx context.Context, request api.GetAdminWalletsRequestObject) (api.GetAdminWalletsResponseObject, error) {
	if s.AdminRecord == nil {
		return api.GetAdminWalletsdefaultApplicationProblemPlusJSONResponse{Body: adminUnconfigured("GetAdminWallets"), StatusCode: http.StatusServiceUnavailable}, nil
	}
	deployment := "production"
	if request.Params.Deployment != nil {
		deployment = string(*request.Params.Deployment)
	}
	limit := 50
	if request.Params.Limit != nil {
		limit = *request.Params.Limit
	}
	var after *execution.WalletCursor
	if request.Params.Cursor != nil {
		cursor, err := decodeWalletCursor(*request.Params.Cursor, deployment)
		if err != nil {
			status, problem := activityProblem("GetAdminWallets", err)
			return api.GetAdminWalletsdefaultApplicationProblemPlusJSONResponse{Body: problem, StatusCode: status}, nil
		}
		after = &cursor
	}
	// The record refuses a limit out of range too; checking here keeps a
	// refused page from costing a read.
	if limit < 1 || limit > execution.MaxWalletPage {
		status, problem := activityProblem("GetAdminWallets", execution.Invalid{Reason: fmt.Sprintf("a page of %d wallets is not between 1 and %d", limit, execution.MaxWalletPage)})
		return api.GetAdminWalletsdefaultApplicationProblemPlusJSONResponse{Body: problem, StatusCode: status}, nil
	}
	page, err := s.AdminRecord.Wallets(ctx, deployment, after, limit)
	if err != nil {
		status, problem := activityProblem("GetAdminWallets", err)
		return api.GetAdminWalletsdefaultApplicationProblemPlusJSONResponse{Body: problem, StatusCode: status}, nil
	}
	data := api.AdminWallets{Deployment: api.AdminWalletsDeployment(deployment), Wallets: make([]api.AdminWallet, 0, len(page.Wallets)), Total: page.Total}
	for _, wallet := range page.Wallets {
		data.Wallets = append(data.Wallets, api.AdminWallet{
			Address: wallet.Address, FirstSeenAt: wallet.FirstSeenAt.UTC(), Source: wallet.Source, Quotes: wallet.Quotes, LandedLegs: wallet.LandedLegs,
			Volume: usdc(wallet.VolumeAtoms), FeeRevenue: usdc(wallet.FeeAtoms),
		})
	}
	if page.Next != nil {
		next := encodeWalletCursor(*page.Next, deployment)
		data.NextCursor = &next
	}
	return api.GetAdminWallets200JSONResponse{Data: data, Meta: s.adminMeta()}, nil
}

// A wallet cursor is opaque to callers: base64url of the deployment, the
// last row's first quote in Unix microseconds (Postgres's resolution, so the
// boundary row compares equal) and its address. Naming the deployment lets a
// cursor carried into another deployment's list be refused, not misread.
func encodeWalletCursor(cursor execution.WalletCursor, deployment string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(fmt.Sprintf("w1|%s|%d|%s", deployment, cursor.FirstSeenAt.UnixMicro(), cursor.Address)))
}

func decodeWalletCursor(encoded, deployment string) (execution.WalletCursor, error) {
	refused := execution.Invalid{Reason: "cursor is not one this wallet list issued"}
	raw, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return execution.WalletCursor{}, refused
	}
	parts := strings.Split(string(raw), "|")
	if len(parts) != 4 || parts[0] != "w1" || parts[3] == "" {
		return execution.WalletCursor{}, refused
	}
	if parts[1] != deployment {
		return execution.WalletCursor{}, execution.Invalid{Reason: fmt.Sprintf("cursor is for the %s list, not %s", parts[1], deployment)}
	}
	micros, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil {
		return execution.WalletCursor{}, refused
	}
	return execution.WalletCursor{FirstSeenAt: time.UnixMicro(micros).UTC(), Address: parts[3]}, nil
}

func (s Server) GetAdminActivity(ctx context.Context, request api.GetAdminActivityRequestObject) (api.GetAdminActivityResponseObject, error) {
	if s.AdminRecord == nil {
		return api.GetAdminActivitydefaultApplicationProblemPlusJSONResponse{Body: adminUnconfigured("GetAdminActivity"), StatusCode: http.StatusServiceUnavailable}, nil
	}
	period := s.adminPeriod(request.Params.From, request.Params.To, deploymentOf(request.Params.Deployment))
	rows, err := s.AdminRecord.RecentActivity(ctx, period)
	if err != nil {
		status, problem := activityProblem("GetAdminActivity", err)
		return api.GetAdminActivitydefaultApplicationProblemPlusJSONResponse{Body: problem, StatusCode: status}, nil
	}
	data := api.AdminActivity{Period: apiPeriod(period), Rows: make([]api.AdminRecordedRow, 0, len(rows))}
	for _, row := range rows {
		data.Rows = append(data.Rows, api.AdminRecordedRow{
			At: row.At.UTC(), Source: api.AdminRecordedRowSource(row.Source), Event: row.Event, Wallet: row.Wallet, Detail: row.Detail,
		})
	}
	return api.GetAdminActivity200JSONResponse{Data: data, Meta: s.adminMeta()}, nil
}

func (s Server) GetAdminEmailOptIns(ctx context.Context, request api.GetAdminEmailOptInsRequestObject) (api.GetAdminEmailOptInsResponseObject, error) {
	if s.AdminOptIns == nil {
		return api.GetAdminEmailOptInsdefaultApplicationProblemPlusJSONResponse{Body: adminUnconfigured("GetAdminEmailOptIns"), StatusCode: http.StatusServiceUnavailable}, nil
	}
	period := s.adminPeriod(request.Params.From, request.Params.To, deploymentOf(request.Params.Deployment))
	if err := period.Check(); err != nil {
		status, problem := activityProblem("GetAdminEmailOptIns", err)
		return api.GetAdminEmailOptInsdefaultApplicationProblemPlusJSONResponse{Body: problem, StatusCode: status}, nil
	}
	summary, err := s.AdminOptIns.Summary(ctx, period.From, period.To, period.Deployment)
	if err != nil {
		status, problem := activityProblem("GetAdminEmailOptIns", err)
		return api.GetAdminEmailOptInsdefaultApplicationProblemPlusJSONResponse{Body: problem, StatusCode: status}, nil
	}
	data := api.AdminEmailOptIns{Period: apiPeriod(period), Counts: make([]api.AdminOptInCount, 0, len(summary.Counts)), Recent: make([]api.AdminMaskedOptIn, 0, len(summary.Recent))}
	for _, count := range summary.Counts {
		data.Counts = append(data.Counts, api.AdminOptInCount{Live: count.Live, Page: count.Page, RefCode: count.RefCode, Optins: count.OptIns})
	}
	for _, optIn := range summary.Recent {
		data.Recent = append(data.Recent, api.AdminMaskedOptIn{MaskedAddress: optIn.Address, ConsentedAt: optIn.ConsentedAt.UTC(), Page: optIn.Page, RefCode: optIn.RefCode})
	}
	return api.GetAdminEmailOptIns200JSONResponse{Data: data, Meta: s.adminMeta()}, nil
}
