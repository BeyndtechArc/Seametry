package gateway_test

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/BeyndtechArc/Seametry/server/internal/alert"
	"github.com/BeyndtechArc/Seametry/server/internal/gateway"
)

type heldOptIns struct {
	kept      []alert.OptIn
	withdrawn []string
	answer    error
}

func (h *heldOptIns) Keep(_ context.Context, optIn alert.OptIn) (string, error) {
	h.kept = append(h.kept, optIn)
	return "token-for-the-link", h.answer
}

func (h *heldOptIns) Withdraw(_ context.Context, token string) error {
	h.withdrawn = append(h.withdrawn, token)
	return h.answer
}

const optInBody = `{"address": "holder@example.com", "consent_version": "2026-10-27", "ref_code": "x", "page": "first_allocation", "deployment": "production"}`

func TestAnEmailOptInNeedsTheServiceSecretAndReturnsItsToken(t *testing.T) {
	held := &heldOptIns{}
	handler := gateway.NewHandler(gateway.NewServer(nil, nil).WithEmailOptIns(held), gateway.ServiceSecret(reportSecret))
	if response := post(handler, "/v1/internal/email-optins", "", optInBody); response.Code != http.StatusUnauthorized || len(held.kept) != 0 {
		t.Fatalf("without the secret: got %d and %d kept, want 401 and none", response.Code, len(held.kept))
	}
	response := post(handler, "/v1/internal/email-optins", reportSecret, optInBody)
	if response.Code != http.StatusAccepted {
		t.Fatalf("got %d: %s", response.Code, response.Body.String())
	}
	var body struct {
		Data struct {
			UnsubscribeToken string `json:"unsubscribe_token"`
		} `json:"data"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil || body.Data.UnsubscribeToken != "token-for-the-link" {
		t.Fatalf("token: %q (%v)", body.Data.UnsubscribeToken, err)
	}
	if got := held.kept[0]; got.Address != "holder@example.com" || got.ConsentVersion != "2026-10-27" || got.RefCode != "x" || got.Page != "first_allocation" {
		t.Fatalf("kept %+v", got)
	}

	held.answer = alert.Invalid{Reason: "address is not one plain email address"}
	if response := post(handler, "/v1/internal/email-optins", reportSecret, optInBody); response.Code != http.StatusBadRequest {
		t.Fatalf("an invalid opt-in: got %d, want 400", response.Code)
	}
}

func TestAnUnsubscribeTokenNoAddressCarriesAnswers404(t *testing.T) {
	held := &heldOptIns{}
	handler := gateway.NewHandler(gateway.NewServer(nil, nil).WithEmailOptIns(held), gateway.ServiceSecret(reportSecret))
	if response := post(handler, "/v1/internal/email-optins/unsubscribe", reportSecret, `{"token": "abc"}`); response.Code != http.StatusNoContent {
		t.Fatalf("a kept token: got %d, want 204", response.Code)
	}
	held.answer = alert.ErrUnknownToken
	if response := post(handler, "/v1/internal/email-optins/unsubscribe", reportSecret, `{"token": "abc"}`); response.Code != http.StatusNotFound {
		t.Fatalf("an unknown token: got %d, want 404", response.Code)
	}
	unrecorded := gateway.NewHandler(gateway.NewServer(nil, nil), gateway.ServiceSecret(reportSecret))
	if response := post(unrecorded, "/v1/internal/email-optins", reportSecret, optInBody); response.Code != http.StatusServiceUnavailable {
		t.Fatalf("no consent record: got %d, want 503", response.Code)
	}
}

func TestARefusedOptInsProblemNamesTheFieldAndNotTheAddress(t *testing.T) {
	handler := gateway.NewHandler(gateway.NewServer(nil, nil).WithEmailOptIns(alert.NewOptIns(nil)), gateway.ServiceSecret(reportSecret))
	body := strings.Replace(optInBody, "holder@example.com", "Holder <holder.private@example.com>", 1)
	response := post(handler, "/v1/internal/email-optins", reportSecret, body)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("got %d: %s, want 400", response.Code, response.Body.String())
	}
	if strings.Contains(response.Body.String(), "holder.private") || !strings.Contains(response.Body.String(), "address") {
		t.Fatalf("problem = %s, want one naming the field and not the address", response.Body.String())
	}
}
