package gateway_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/BeyndtechArc/Seametry/server/internal/execution"
	"github.com/BeyndtechArc/Seametry/server/internal/gateway"
)

type heldReports struct {
	quotes      []execution.Quote
	submissions []execution.Submission
	funnel      []execution.FunnelEvent
	answer      error
}

func (h *heldReports) RecordQuote(_ context.Context, quote execution.Quote) error {
	h.quotes = append(h.quotes, quote)
	return h.answer
}

func (h *heldReports) RecordSubmission(_ context.Context, submission execution.Submission) error {
	h.submissions = append(h.submissions, submission)
	return h.answer
}

func (h *heldReports) RecordFunnel(_ context.Context, _ string, events []execution.FunnelEvent, _ time.Time) error {
	h.funnel = append(h.funnel, events...)
	return h.answer
}

const reportSecret = "fixture-activity-secret"

const quoteBody = `{
  "id": "5f0c2f5e-7a1d-4c2b-9b8e-1d2c3b4a5f60", "wallet": "FFyrQgpU4BQ2FLesy6t5MmPUDimPj2ghwChTMrLBN5DM",
  "network": "mainnet", "kind": "sell", "plan_size": 1, "deployment": "production", "prepared_at": "2026-10-16T09:00:00Z",
  "first_touch": {"referrer_host": "x.com", "utm_campaign": "colosseum"},
  "legs": [{
    "id": "0d6a4d2e-1b3c-4e5f-8a7b-9c0d1e2f3a4b", "mint": "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh", "symbol": "NVDAx",
    "in": {"atoms": "450000", "scale": 8}, "out": {"atoms": "996449", "scale": 6}, "floor": {"atoms": "986484", "scale": 6},
    "routing_fee_bps": 19, "tip_offset_bps": 6, "simulated_fee_atoms": "1893", "tip_lamports": "5000",
    "landing": "sender", "last_valid_block_height": 435000000,
    "message_sha256": "8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4"
  }]
}`

func post(handler http.Handler, path, secret, body string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	if secret != "" {
		request.Header.Set("X-Seametry-Service-Secret", secret)
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}

func TestAnInternalReportNeedsTheServiceSecret(t *testing.T) {
	held := &heldReports{}
	core := gateway.NewServer(nil, nil).WithActivity(held)
	handler := gateway.NewHandler(core, gateway.ServiceSecret(reportSecret))
	for name, secret := range map[string]string{"missing": "", "wrong": "fixture-activity-secreT"} {
		if response := post(handler, "/v1/internal/activity/quotes", secret, quoteBody); response.Code != http.StatusUnauthorized {
			t.Errorf("%s secret: got %d, want 401", name, response.Code)
		}
	}
	if len(held.quotes) != 0 {
		t.Fatalf("a refused report reached the record: %d quotes", len(held.quotes))
	}
	unset := gateway.NewHandler(core, gateway.ServiceSecret(""))
	if response := post(unset, "/v1/internal/activity/quotes", reportSecret, quoteBody); response.Code != http.StatusServiceUnavailable {
		t.Fatalf("an unset secret: got %d, want 503, so nothing is admitted by a missing configuration", response.Code)
	}
	// Public paths are not the secret's to guard.
	request := httptest.NewRequest(http.MethodGet, "/v1/me", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code == http.StatusServiceUnavailable || strings.Contains(response.Body.String(), "Service secret") {
		t.Fatalf("GET /v1/me was answered by the secret check: %d %s", response.Code, response.Body.String())
	}
}

func TestAQuoteReportReachesTheRecordWhole(t *testing.T) {
	held := &heldReports{}
	handler := gateway.NewHandler(gateway.NewServer(nil, nil).WithActivity(held), gateway.ServiceSecret(reportSecret))
	response := post(handler, "/v1/internal/activity/quotes", reportSecret, quoteBody)
	if response.Code != http.StatusNoContent {
		t.Fatalf("got %d %s, want 204", response.Code, response.Body.String())
	}
	if len(held.quotes) != 1 || len(held.quotes[0].Legs) != 1 {
		t.Fatalf("held %+v", held.quotes)
	}
	quote, leg := held.quotes[0], held.quotes[0].Legs[0]
	if quote.Kind != "sell" || quote.FirstTouch == nil || quote.FirstTouch.UTMCampaign != "colosseum" {
		t.Fatalf("quote fields lost on the way: %+v", quote)
	}
	if leg.Out != (execution.Amount{Atoms: "996449", Scale: 6}) || leg.TipOffsetBps != 6 || leg.Landing != "sender" {
		t.Fatalf("leg fields lost on the way: %+v", leg)
	}
}

func TestARefusedReportNamesItsReason(t *testing.T) {
	held := &heldReports{answer: execution.Invalid{Reason: `wallet "x" is not a 32-byte base58 Solana address`}}
	handler := gateway.NewHandler(gateway.NewServer(nil, nil).WithActivity(held), gateway.ServiceSecret(reportSecret))
	response := post(handler, "/v1/internal/activity/quotes", reportSecret, quoteBody)
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "32-byte base58") {
		t.Fatalf("got %d %s, want 400 naming the field", response.Code, response.Body.String())
	}
	held.answer = execution.ErrUnknownLeg
	submission := `{"message_sha256": "8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4", "submitted_at": "2026-10-16T09:00:05Z", "result": "sent"}`
	if response := post(handler, "/v1/internal/activity/submissions", reportSecret, submission); response.Code != http.StatusNotFound {
		t.Fatalf("an unknown leg: got %d, want 404", response.Code)
	}
}

func TestWithoutARecordReportsAreRefusedNotDropped(t *testing.T) {
	handler := gateway.NewHandler(gateway.NewServer(nil, nil), gateway.ServiceSecret(reportSecret))
	response := post(handler, "/v1/internal/activity/funnel", reportSecret, `{"deployment": "production", "events": [{"kind": "review_opened"}]}`)
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("got %d, want 503", response.Code)
	}
	var problem map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &problem); err != nil || problem["detail"] == nil {
		t.Fatalf("the refusal is not a problem detail: %s", response.Body.String())
	}
}
