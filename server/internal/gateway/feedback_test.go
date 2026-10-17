package gateway_test

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/BeyndtechArc/Seametry/server/internal/alert"
	"github.com/BeyndtechArc/Seametry/server/internal/gateway"
)

type heldFeedback struct {
	received  []alert.Submission
	delivered chan struct{}
	answer    error
}

func (h *heldFeedback) Receive(_ context.Context, submission alert.Submission) ([16]byte, func(context.Context), error) {
	h.received = append(h.received, submission)
	return [16]byte{0x5f, 0x0c}, func(context.Context) { close(h.delivered) }, h.answer
}

func TestFeedbackIsStoredAnsweredThenDelivered(t *testing.T) {
	held := &heldFeedback{delivered: make(chan struct{})}
	handler := gateway.NewHandler(gateway.NewServer(nil, nil).WithFeedback(held), gateway.ServiceSecret(reportSecret))
	body := `{"message": "Sell All stalled.", "reply_to": "holder@example.com", "page": "/app/positions", "deployment": "production"}`
	if response := post(handler, "/v1/internal/feedback", "", body); response.Code != http.StatusUnauthorized {
		t.Fatalf("without the secret: got %d, want 401", response.Code)
	}
	response := post(handler, "/v1/internal/feedback", reportSecret, body)
	if response.Code != http.StatusAccepted || !strings.Contains(response.Body.String(), `"id":"5f0c0000-0000-0000-0000-000000000000"`) {
		t.Fatalf("got %d %s, want 202 with the stored id", response.Code, response.Body.String())
	}
	if len(held.received) != 1 || held.received[0].ReplyTo != "holder@example.com" || held.received[0].Page != "/app/positions" {
		t.Fatalf("received %+v", held.received)
	}
	select {
	case <-held.delivered:
	case <-time.After(5 * time.Second):
		t.Fatal("delivery never started after the answer")
	}
}

func TestRefusedFeedbackNamesWhatIsWrong(t *testing.T) {
	held := &heldFeedback{delivered: make(chan struct{}), answer: alert.Invalid{Reason: "message is empty"}}
	handler := gateway.NewHandler(gateway.NewServer(nil, nil).WithFeedback(held), gateway.ServiceSecret(reportSecret))
	response := post(handler, "/v1/internal/feedback", reportSecret, `{"message": " ", "deployment": "production"}`)
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "message is empty") {
		t.Fatalf("got %d %s", response.Code, response.Body.String())
	}
}
