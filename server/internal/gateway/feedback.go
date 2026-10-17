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
			status, title, detail = http.StatusBadRequest, "Feedback refused", "ReceiveFeedback: "+invalid.Reason
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
