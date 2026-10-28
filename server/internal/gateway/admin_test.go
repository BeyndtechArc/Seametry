package gateway_test

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/BeyndtechArc/Seametry/server/internal/alert"
	"github.com/BeyndtechArc/Seametry/server/internal/execution"
	"github.com/BeyndtechArc/Seametry/server/internal/gateway"
	"github.com/BeyndtechArc/Seametry/server/internal/identity"
)

type heldAdmin struct {
	period execution.Period
	reads  int
	// The last wallet page asked for, and whether older wallets remain.
	after     *execution.WalletCursor
	limit     int
	moreAfter *execution.WalletCursor
}

func (h *heldAdmin) Overview(_ context.Context, period execution.Period) (execution.Overview, error) {
	h.period, h.reads = period, h.reads+1
	if err := period.Check(); err != nil {
		return execution.Overview{}, err
	}
	return execution.Overview{VolumeAtoms: "2000000", FeeAtoms: "3000", TipCostAtoms: "0", LandedLegs: 2, SeenWallets: 1, SeenAndActivatedWallets: 1, ActivatedWallets: 1, ActiveWallets: 1}, nil
}

func (h *heldAdmin) Sources(_ context.Context, period execution.Period) ([]execution.SourceTotals, error) {
	h.period, h.reads = period, h.reads+1
	return []execution.SourceTotals{{Source: "unknown", SeenWallets: 1, VolumeAtoms: "0", FeeAtoms: "0"}}, nil
}

func (h *heldAdmin) Wallets(_ context.Context, deployment string, after *execution.WalletCursor, limit int) (execution.WalletPage, error) {
	h.reads++
	h.after, h.limit = after, limit
	return execution.WalletPage{Total: 7, Next: h.moreAfter}, nil
}

func (h *heldAdmin) RecentActivity(_ context.Context, period execution.Period) ([]execution.RecordedRow, error) {
	h.period, h.reads = period, h.reads+1
	return []execution.RecordedRow{{At: period.To.Add(-time.Minute), Source: "chain", Event: "landed", Wallet: linkedWallet, Detail: "NVDAx"}}, nil
}

func (h *heldAdmin) Summary(_ context.Context, from, to time.Time, deployment string) (alert.OptInSummary, error) {
	h.reads++
	return alert.OptInSummary{Recent: []alert.MaskedOptIn{{Address: alert.MaskAddress("storm@example.com"), ConsentedAt: from, Page: "feedback", RefCode: "unknown"}}}, nil
}

type adminClaims struct {
	email    string
	verified any
}

// adminHandler is the Gateway as server/cmd/seametry wires it, with the
// admin gate holding allowlist, and a signer for account tokens carrying
// whatever email claims a test names.
func adminHandler(t *testing.T, allowlist string, held *heldAdmin, now time.Time) (http.Handler, func(adminClaims) string) {
	t.Helper()
	return adminHandlerWith(t, held, now, gateway.AdminGate(allowlist))
}

func adminHandlerWith(t *testing.T, held *heldAdmin, now time.Time, gate func(http.Handler) http.Handler) (http.Handler, func(adminClaims) string) {
	t.Helper()
	public, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	const origin = "https://accounts.example"
	keySet, err := json.Marshal(map[string]any{"keys": []map[string]string{{
		"kid": "key-1", "kty": "OKP", "crv": "Ed25519", "alg": "EdDSA", "x": base64.RawURLEncoding.EncodeToString(public),
	}}})
	if err != nil {
		t.Fatal(err)
	}
	client := &http.Client{Transport: accountRoundTrip(func(request *http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(string(keySet))), Request: request}, nil
	})}
	verifier, err := identity.NewVerifier(origin, "https://accounts.example/api/auth/jwks", client)
	if err != nil {
		t.Fatal(err)
	}
	core := gateway.NewServer(nil, nil).WithAdmin(held, held)
	core.Now = func() time.Time { return now }
	handler := gateway.NewHandler(core, gateway.ServiceSecret(reportSecret), func(next http.Handler) http.Handler {
		return verifier.Middleware(next, func() time.Time { return now })
	}, gate)
	sign := func(claims adminClaims) string {
		header, _ := json.Marshal(map[string]string{"alg": "EdDSA", "kid": "key-1", "typ": "JWT"})
		body := map[string]any{"sub": "account-1", "iss": origin, "aud": origin, "exp": now.Add(time.Minute).Unix(), "wallets": []string{}}
		if claims.email != "" {
			body["email"] = claims.email
		}
		if claims.verified != nil {
			body["email_verified"] = claims.verified
		}
		payload, _ := json.Marshal(body)
		encoded := base64.RawURLEncoding.EncodeToString(header) + "." + base64.RawURLEncoding.EncodeToString(payload)
		return encoded + "." + base64.RawURLEncoding.EncodeToString(ed25519.Sign(private, []byte(encoded)))
	}
	return handler, sign
}

var adminPaths = []string{"/v1/admin/overview", "/v1/admin/sources", "/v1/admin/wallets", "/v1/admin/activity", "/v1/admin/email-optins", "/v1/admin", "/v1/admin/nothing-here"}

func TestAdminGateAnswersEveryoneButAVerifiedAllowlistedEmailAsAMissingPath(t *testing.T) {
	now := time.Date(2026, 10, 27, 12, 0, 0, 0, time.UTC)
	missing := func(handler http.Handler) (int, string) {
		response := getActivity(handler, "/v1/no-such-path", "")
		return response.Code, response.Body.String()
	}
	cases := []struct {
		name      string
		allowlist string
		claims    *adminClaims
	}{
		{"signed out", "storm@example.com", nil},
		{"signed in, not on the allowlist", "storm@example.com", &adminClaims{"holder@example.com", true}},
		{"on the allowlist, email not verified", "storm@example.com", &adminClaims{"storm@example.com", false}},
		{"on the allowlist, no verification claim", "storm@example.com", &adminClaims{"storm@example.com", nil}},
		{"verified, allowlist empty", "", &adminClaims{"storm@example.com", true}},
		{"verified, allowlist only separators", " , ,", &adminClaims{"storm@example.com", true}},
		{"a suffix of an allowlisted address", "storm@example.com", &adminClaims{"m@example.com", true}},
		{"two allowlisted addresses run together", "storm@example.com,ops@example.com", &adminClaims{"storm@example.com,ops@example.com", true}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			held := &heldAdmin{}
			handler, sign := adminHandler(t, tc.allowlist, held, now)
			wantStatus, wantBody := missing(handler)
			token := ""
			if tc.claims != nil {
				token = sign(*tc.claims)
			}
			for _, path := range adminPaths {
				response := getActivity(handler, path, token)
				if response.Code != http.StatusNotFound || response.Code != wantStatus || response.Body.String() != wantBody {
					t.Fatalf("GET %s = %d %q, want the missing path's %d %q", path, response.Code, response.Body.String(), wantStatus, wantBody)
				}
			}
			if held.reads != 0 {
				t.Fatalf("the record was read %d times for a caller the gate refused", held.reads)
			}
		})
	}
}

func TestAdminGateAdmitsAVerifiedAllowlistedEmailWithoutCase(t *testing.T) {
	now := time.Date(2026, 10, 27, 12, 0, 0, 0, time.UTC)
	held := &heldAdmin{}
	handler, sign := adminHandler(t, " ops@example.com , Storm@Example.com ", held, now)
	token := sign(adminClaims{"storm@EXAMPLE.com", true})
	for _, path := range adminPaths[:5] {
		response := getActivity(handler, path, token)
		if response.Code != http.StatusOK {
			t.Fatalf("GET %s = %d: %s", path, response.Code, response.Body.String())
		}
		if response.Header().Get("Cache-Control") != "no-store" {
			t.Fatalf("GET %s Cache-Control = %q, want no-store", path, response.Header().Get("Cache-Control"))
		}
	}
	if response := getActivity(handler, "/v1/admin/nothing-here", token); response.Code != http.StatusNotFound {
		t.Fatalf("an admin's unknown admin path = %d, want 404", response.Code)
	}
}

func TestAdminReadsDefaultToTheLastThirtyDaysOfProduction(t *testing.T) {
	now := time.Date(2026, 10, 27, 12, 0, 0, 0, time.UTC)
	held := &heldAdmin{}
	handler, sign := adminHandler(t, "storm@example.com", held, now)
	token := sign(adminClaims{"storm@example.com", true})

	response := getActivity(handler, "/v1/admin/overview", token)
	if response.Code != http.StatusOK {
		t.Fatalf("overview = %d: %s", response.Code, response.Body.String())
	}
	if !held.period.To.Equal(now) || !held.period.From.Equal(now.Add(-30*24*time.Hour)) || held.period.Deployment != "production" {
		t.Fatalf("period = %+v, want the 30 days to %s in production", held.period, now)
	}
	var body struct {
		Data struct {
			Volume struct {
				Atoms string `json:"atoms"`
				Scale int    `json:"scale"`
			} `json:"volume"`
		} `json:"data"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Data.Volume.Atoms != "2000000" || body.Data.Volume.Scale != 6 {
		t.Fatalf("volume = %+v, want 2000000 atoms at scale 6", body.Data.Volume)
	}

	response = getActivity(handler, "/v1/admin/sources?from=2026-10-01T00:00:00Z&to=2026-10-02T00:00:00Z&deployment=preview", token)
	if response.Code != http.StatusOK || held.period.Deployment != "preview" || held.period.From.Day() != 1 || held.period.To.Day() != 2 {
		t.Fatalf("sources = %d, period %+v: %s", response.Code, held.period, response.Body.String())
	}

	response = getActivity(handler, "/v1/admin/overview?from=2026-10-02T00:00:00Z&to=2026-10-01T00:00:00Z", token)
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "is not before") {
		t.Fatalf("a reversed period = %d %s, want 400 naming it", response.Code, response.Body.String())
	}
}

func TestAdminOptInsNeverCarryAFullAddress(t *testing.T) {
	now := time.Date(2026, 10, 27, 12, 0, 0, 0, time.UTC)
	held := &heldAdmin{}
	handler, sign := adminHandler(t, "storm@example.com", held, now)
	response := getActivity(handler, "/v1/admin/email-optins", sign(adminClaims{"storm@example.com", true}))
	if response.Code != http.StatusOK {
		t.Fatalf("email-optins = %d: %s", response.Code, response.Body.String())
	}
	if strings.Contains(response.Body.String(), "storm@example.com") || !strings.Contains(response.Body.String(), `"masked_address":"s***@e***.com"`) {
		t.Fatalf("email-optins body = %s, want only the masked address", response.Body.String())
	}
}

func TestAdminWalletsPageByAnOpaqueCursorThatRoundTrips(t *testing.T) {
	now := time.Date(2026, 10, 27, 12, 0, 0, 0, time.UTC)
	last := execution.WalletCursor{FirstSeenAt: time.Date(2026, 10, 11, 9, 0, 0, 123456000, time.UTC), Address: linkedWallet}
	held := &heldAdmin{moreAfter: &last}
	handler, sign := adminHandler(t, "storm@example.com", held, now)
	token := sign(adminClaims{"storm@example.com", true})

	response := getActivity(handler, "/v1/admin/wallets?limit=2", token)
	var body struct {
		Data struct {
			Total      int64   `json:"total"`
			NextCursor *string `json:"next_cursor"`
		} `json:"data"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil || response.Code != http.StatusOK {
		t.Fatalf("first page = %d (%v): %s", response.Code, err, response.Body.String())
	}
	if held.after != nil || held.limit != 2 || body.Data.Total != 7 || body.Data.NextCursor == nil || *body.Data.NextCursor == "" {
		t.Fatalf("first page: after %v limit %d total %d next %v, want no cursor, limit 2, total 7 and a next cursor", held.after, held.limit, body.Data.Total, body.Data.NextCursor)
	}

	held.moreAfter = nil
	response = getActivity(handler, "/v1/admin/wallets?cursor="+*body.Data.NextCursor, token)
	if response.Code != http.StatusOK || held.after == nil || !held.after.FirstSeenAt.Equal(last.FirstSeenAt) || held.after.Address != last.Address || held.limit != 50 {
		t.Fatalf("second page = %d, after %+v limit %d, want the first page's last row and the default 50: %s", response.Code, held.after, held.limit, response.Body.String())
	}
	if strings.Contains(response.Body.String(), "next_cursor") {
		t.Fatalf("the last page named a next cursor: %s", response.Body.String())
	}

	for _, refused := range []string{"cursor=not-a-cursor", "limit=0", "limit=201"} {
		held.reads = 0
		if response := getActivity(handler, "/v1/admin/wallets?"+refused, token); response.Code != http.StatusBadRequest || held.reads != 0 {
			t.Fatalf("GET wallets?%s = %d after %d reads, want 400 before any read: %s", refused, response.Code, held.reads, response.Body.String())
		}
	}
}

func TestEveryAdmittedAdminReadIsAuditedBySubjectAndOutcomeWithNoEmailOrResult(t *testing.T) {
	now := time.Date(2026, 10, 27, 12, 0, 0, 0, time.UTC)
	held := &heldAdmin{}
	var events []gateway.AdminReadEvent
	gate := gateway.AdminGateWith("storm@example.com", gateway.AdminGateOptions{
		Audit: func(event gateway.AdminReadEvent) { events = append(events, event) }, ReadsPerMinute: 60, Now: func() time.Time { return now },
	})
	handler, sign := adminHandlerWith(t, held, now, gate)
	token := sign(adminClaims{"storm@example.com", true})

	getActivity(handler, "/v1/admin/overview", token)
	getActivity(handler, "/v1/admin/overview?from=2026-10-02T00:00:00Z&to=2026-10-01T00:00:00Z", token)
	getActivity(handler, "/v1/admin/nothing-here", token)
	getActivity(handler, "/v1/admin/overview", sign(adminClaims{"holder@example.com", true}))
	want := []gateway.AdminReadEvent{
		{Operation: "overview", Subject: "account-1", At: now, Outcome: "ok"},
		{Operation: "overview", Subject: "account-1", At: now, Outcome: "refused"},
		{Operation: "nothing-here", Subject: "account-1", At: now, Outcome: "not_found"},
	}
	if len(events) != len(want) {
		t.Fatalf("audited %d reads, want the 3 admitted ones and none for the refused caller: %+v", len(events), events)
	}
	for index := range want {
		if events[index] != want[index] {
			t.Fatalf("event %d = %+v, want %+v", index, events[index], want[index])
		}
	}
	encoded, _ := json.Marshal(events)
	for _, absent := range []string{"@", "storm", "2000000"} {
		if strings.Contains(string(encoded), absent) {
			t.Fatalf("an audit event carries %q: %s", absent, encoded)
		}
	}
}

func TestAnAdminReadsBeyondThePolicyAreRefusedBeforeTheRecordIsRead(t *testing.T) {
	now := time.Date(2026, 10, 27, 12, 0, 0, 0, time.UTC)
	held := &heldAdmin{}
	var outcomes []string
	gate := gateway.AdminGateWith("storm@example.com", gateway.AdminGateOptions{
		Audit: func(event gateway.AdminReadEvent) { outcomes = append(outcomes, event.Outcome) }, ReadsPerMinute: 3, Now: func() time.Time { return now },
	})
	handler, sign := adminHandlerWith(t, held, now, gate)
	token := sign(adminClaims{"storm@example.com", true})
	for range 3 {
		if response := getActivity(handler, "/v1/admin/sources", token); response.Code != http.StatusOK {
			t.Fatalf("a read within the policy = %d", response.Code)
		}
	}
	response := getActivity(handler, "/v1/admin/sources", token)
	if response.Code != http.StatusTooManyRequests || response.Header().Get("Retry-After") == "" || held.reads != 3 {
		t.Fatalf("the fourth read in a minute = %d, Retry-After %q, after %d record reads; want 429 with Retry-After and 3 reads", response.Code, response.Header().Get("Retry-After"), held.reads)
	}
	if outcomes[len(outcomes)-1] != "rate_limited" {
		t.Fatalf("the refused read was audited as %q, want rate_limited", outcomes[len(outcomes)-1])
	}
	now = now.Add(time.Minute)
	if response := getActivity(handler, "/v1/admin/sources", token); response.Code != http.StatusOK {
		t.Fatalf("a read a minute later = %d, want the policy refilled", response.Code)
	}
}
