package gateway

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/BeyndtechArc/Seametry/server/internal/alert"
	"github.com/BeyndtechArc/Seametry/server/internal/gateway/api"
)

// FeedbackDesk is Alert's feedback, as the Gateway needs it: Receive stores
// a message and hands back its delivery to run after the answer.
type FeedbackDesk interface {
	Receive(ctx context.Context, submission alert.Submission) ([16]byte, func(context.Context), error)
}

// WithFeedback gives the Gateway Alert's feedback desk. Without one,
// feedback is refused with 503 rather than accepted and lost.
func (s Server) WithFeedback(desk FeedbackDesk) Server {
	s.Feedback = desk
	return s
}

// deliveryTimeout bounds one mail delivery, which runs after the visitor has
// their answer; a slower server leaves the row marked failed, not pending.
const deliveryTimeout = 30 * time.Second

func (s Server) ReceiveFeedback(ctx context.Context, request api.ReceiveFeedbackRequestObject) (api.ReceiveFeedbackResponseObject, error) {
	if s.Feedback == nil {
		return api.ReceiveFeedbackdefaultApplicationProblemPlusJSONResponse{
			Body:       gatewayProblem(http.StatusServiceUnavailable, "Feedback unavailable", "ReceiveFeedback has no feedback desk on this Gateway: it was started without one."),
			StatusCode: http.StatusServiceUnavailable,
		}, nil
	}
	body := request.Body
	id, deliver, err := s.Feedback.Receive(ctx, alert.Submission{
		Message: body.Message, ReplyTo: optional(body.ReplyTo), Wallet: optional(body.Wallet),
		Page: optional(body.Page), Deployment: string(body.Deployment),
	})
	if err != nil {
		var invalid alert.Invalid
		status, title, detail := http.StatusInternalServerError, "Feedback not stored", "ReceiveFeedback: "+err.Error()
		if errors.As(err, &invalid) {
			status, title, detail = http.StatusBadRequest, "Feedback refused", "ReceiveFeedback: "+refusal(invalid)
		}
		return api.ReceiveFeedbackdefaultApplicationProblemPlusJSONResponse{Body: gatewayProblem(status, title, detail), StatusCode: status}, nil
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), deliveryTimeout)
		defer cancel()
		deliver(ctx)
	}()
	response := api.ReceiveFeedback202JSONResponse{}
	response.Data.Id = id
	return response, nil
}

// EmailOptIns is Alert's consent record for email, as the Gateway needs it.
type EmailOptIns interface {
	Keep(ctx context.Context, optIn alert.OptIn) (string, error)
	Withdraw(ctx context.Context, token string) error
}

// WithEmailOptIns gives the Gateway Alert's consent record. Without one,
// both operations answer 503 rather than accept an address they cannot keep.
func (s Server) WithEmailOptIns(optIns EmailOptIns) Server {
	s.OptIns = optIns
	return s
}

func (s Server) RecordEmailOptIn(ctx context.Context, request api.RecordEmailOptInRequestObject) (api.RecordEmailOptInResponseObject, error) {
	if s.OptIns == nil {
		return api.RecordEmailOptIndefaultApplicationProblemPlusJSONResponse{
			Body:       gatewayProblem(http.StatusServiceUnavailable, "Email opt-in unavailable", "RecordEmailOptIn has no consent record on this Gateway: it was started without one."),
			StatusCode: http.StatusServiceUnavailable,
		}, nil
	}
	body := request.Body
	page := ""
	if body.Page != nil {
		page = string(*body.Page)
	}
	token, err := s.OptIns.Keep(ctx, alert.OptIn{
		Address: body.Address, ConsentVersion: body.ConsentVersion, RefCode: optional(body.RefCode), Wallet: optional(body.Wallet),
		Page: page, Deployment: string(body.Deployment),
	})
	if err != nil {
		var invalid alert.Invalid
		status, title, detail := http.StatusInternalServerError, "Email opt-in not kept", "RecordEmailOptIn: "+err.Error()
		if errors.As(err, &invalid) {
			status, title, detail = http.StatusBadRequest, "Email opt-in refused", "RecordEmailOptIn: "+refusal(invalid)
		}
		return api.RecordEmailOptIndefaultApplicationProblemPlusJSONResponse{Body: gatewayProblem(status, title, detail), StatusCode: status}, nil
	}
	response := api.RecordEmailOptIn202JSONResponse{}
	response.Data.UnsubscribeToken = token
	return response, nil
}

func (s Server) WithdrawEmailOptIn(ctx context.Context, request api.WithdrawEmailOptInRequestObject) (api.WithdrawEmailOptInResponseObject, error) {
	if s.OptIns == nil {
		return api.WithdrawEmailOptIndefaultApplicationProblemPlusJSONResponse{
			Body:       gatewayProblem(http.StatusServiceUnavailable, "Email opt-in unavailable", "WithdrawEmailOptIn has no consent record on this Gateway: it was started without one."),
			StatusCode: http.StatusServiceUnavailable,
		}, nil
	}
	if err := s.OptIns.Withdraw(ctx, request.Body.Token); err != nil {
		status, title, detail := http.StatusInternalServerError, "Unsubscribe not recorded", "WithdrawEmailOptIn: "+err.Error()
		if errors.Is(err, alert.ErrUnknownToken) {
			status, title, detail = http.StatusNotFound, "Unsubscribe link not recognised", "WithdrawEmailOptIn: no kept address carries this token; it was mistyped or already used."
		}
		return api.WithdrawEmailOptIndefaultApplicationProblemPlusJSONResponse{Body: gatewayProblem(status, title, detail), StatusCode: status}, nil
	}
	return api.WithdrawEmailOptIn204Response{}, nil
}

// refusal names the refused field and why, by code, without the value: an
// address a visitor typed is never repeated back or into the web's logs.
func refusal(invalid alert.Invalid) string {
	if invalid.Field == "" {
		return invalid.Reason
	}
	return "field " + invalid.Field + ", code " + invalid.Code + ": " + invalid.Reason
}
