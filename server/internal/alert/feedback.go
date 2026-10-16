package alert

import (
	"context"
	"crypto/rand"
	"fmt"
	"log/slog"
	"net/mail"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/BeyndtechArc/Seametry/server/internal/base58"
	"github.com/BeyndtechArc/Seametry/server/internal/store/alertdb"
)

// Sender is what feedback needs of a mailer; *Mailer is one.
type Sender interface {
	Send(ctx context.Context, message Message) error
}

// Feedback keeps what visitors send and mails it to the team.
type Feedback struct {
	q      *alertdb.Queries
	mailer Sender
	now    func() time.Time
}

// NewFeedback records feedback in db and mails it through mailer, which may
// be nil: the message is still kept, marked not_configured.
func NewFeedback(db alertdb.DBTX, mailer Sender) *Feedback {
	return &Feedback{q: alertdb.New(db), mailer: mailer, now: time.Now}
}

// Invalid is feedback refused as written, naming the field.
type Invalid struct{ Reason string }

func (e Invalid) Error() string { return "alert: " + e.Reason }

type Submission struct {
	Message    string
	ReplyTo    string
	Wallet     string
	Page       string
	Deployment string
}

type checked struct {
	message  string
	replyTo  *mail.Address
	wallet   string
	page     string
	deployed string
}

func (s Submission) check() (checked, error) {
	message := strings.TrimSpace(s.Message)
	if message == "" {
		return checked{}, Invalid{"message is empty"}
	}
	if n := utf8.RuneCountInString(message); n > 4000 {
		return checked{}, Invalid{fmt.Sprintf("message is %d characters; at most 4000 are kept", n)}
	}
	out := checked{message: message, page: strings.TrimSpace(s.Page), deployed: s.Deployment}
	if replyTo := strings.TrimSpace(s.ReplyTo); replyTo != "" {
		address, err := mail.ParseAddress(replyTo)
		if err != nil || len(address.Address) > 254 || address.Address != replyTo {
			return checked{}, Invalid{fmt.Sprintf("reply_to %q is not one plain email address", replyTo)}
		}
		out.replyTo = address
	}
	if s.Wallet != "" {
		if decoded, err := base58.Decode(s.Wallet); err != nil || len(decoded) != 32 {
			return checked{}, Invalid{fmt.Sprintf("wallet %q is not a 32-byte base58 Solana address", s.Wallet)}
		}
		out.wallet = s.Wallet
	}
	if utf8.RuneCountInString(out.page) > 500 {
		return checked{}, Invalid{"page is longer than 500 characters"}
	}
	switch s.Deployment {
	case "production", "preview", "development":
	default:
		return checked{}, Invalid{fmt.Sprintf("deployment %q is not production, preview or development", s.Deployment)}
	}
	return out, nil
}

func text(value string) pgtype.Text { return pgtype.Text{String: value, Valid: value != ""} }

// Receive stores the feedback and returns its id and the mail to send. The
// caller sends it with Deliver, after answering, so the visitor never waits
// on the mail server.
func (f *Feedback) Receive(ctx context.Context, submission Submission) ([16]byte, func(context.Context), error) {
	valid, err := submission.check()
	if err != nil {
		return [16]byte{}, nil, err
	}
	id, err := newID()
	if err != nil {
		return id, nil, err
	}
	received := f.now().UTC()
	err = f.q.InsertFeedback(ctx, alertdb.InsertFeedbackParams{
		ID: pgtype.UUID{Bytes: id, Valid: true}, Message: valid.message, ReplyTo: text(addressOf(valid.replyTo)),
		Wallet: text(valid.wallet), Page: text(valid.page), Deployment: valid.deployed,
		ReceivedAt: pgtype.Timestamptz{Time: received, Valid: true},
	})
	if err != nil {
		return id, nil, fmt.Errorf("alert: storing feedback: %w", err)
	}
	return id, func(ctx context.Context) { f.deliver(ctx, id, valid, received) }, nil
}

func addressOf(address *mail.Address) string {
	if address == nil {
		return ""
	}
	return address.Address
}

func (f *Feedback) deliver(ctx context.Context, id [16]byte, valid checked, received time.Time) {
	outcome, detail := "not_configured", "SEAMETRY_SMTP_HOST is not set on this Gateway."
	if f.mailer != nil {
		body := valid.message + "\n\n--\nReceived " + received.Format(time.RFC1123Z) + " on " + valid.deployed
		if valid.page != "" {
			body += "\nPage: " + valid.page
		}
		if valid.wallet != "" {
			body += "\nWallet: " + valid.wallet
		}
		if valid.replyTo != nil {
			body += "\nReply to: " + valid.replyTo.Address
		}
		subject := "Seametry feedback"
		if first, _, _ := strings.Cut(valid.message, "\n"); first != "" {
			subject += ": " + truncate(first, 60)
		}
		outcome, detail = "delivered", ""
		if err := f.mailer.Send(ctx, Message{Subject: subject, ReplyTo: valid.replyTo, Body: body}); err != nil {
			outcome, detail = "failed", truncate(err.Error(), 1000)
		}
	}
	err := f.q.RecordDelivery(ctx, alertdb.RecordDeliveryParams{
		ID: pgtype.UUID{Bytes: id, Valid: true}, Delivery: outcome, DeliveryDetail: text(detail),
		DeliveredAt: pgtype.Timestamptz{Time: f.now().UTC(), Valid: outcome == "delivered"},
	})
	if err != nil || outcome == "failed" {
		slog.Warn("alert: feedback delivery", "outcome", outcome, "detail", detail, "record_error", err)
	}
}

// newID is a version 4 UUID.
func newID() ([16]byte, error) {
	var id [16]byte
	if _, err := rand.Read(id[:]); err != nil {
		return id, err
	}
	id[6] = id[6]&0x0f | 0x40
	id[8] = id[8]&0x3f | 0x80
	return id, nil
}

func truncate(value string, limit int) string {
	if utf8.RuneCountInString(value) <= limit {
		return value
	}
	return string([]rune(value)[:limit-1]) + "…"
}
