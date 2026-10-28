package alert

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net/url"
	"os"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/BeyndtechArc/Seametry/server/internal/store"
)

// freshPool gives each test its own migrated database, as the receipt and
// execution tests do.
func freshPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	adminDSN := os.Getenv("SEAMETRY_TEST_DATABASE_URL")
	if adminDSN == "" {
		t.Skip("SEAMETRY_TEST_DATABASE_URL is not set; feedback is kept in Postgres and needs a real one to prove")
	}
	ctx := context.Background()
	suffix := make([]byte, 6)
	if _, err := rand.Read(suffix); err != nil {
		t.Fatal(err)
	}
	name := "feedback_" + hex.EncodeToString(suffix)
	admin, err := store.Open(adminDSN)
	if err != nil {
		t.Fatalf("opening the admin connection: %v", err)
	}
	t.Cleanup(func() { admin.Close() })
	if _, err := admin.ExecContext(ctx, "CREATE DATABASE "+name); err != nil {
		t.Fatalf("creating %s: %v", name, err)
	}
	parsed, err := url.Parse(adminDSN)
	if err != nil {
		t.Fatalf("SEAMETRY_TEST_DATABASE_URL is not a URL: %v", err)
	}
	parsed.Path = "/" + name
	db, err := store.Open(parsed.String())
	if err != nil {
		t.Fatalf("opening %s: %v", name, err)
	}
	if err := store.MigrateAll(ctx, db); err != nil {
		t.Fatalf("migrating %s: %v", name, err)
	}
	db.Close()
	pool, err := store.OpenPool(ctx, parsed.String())
	if err != nil {
		t.Fatalf("opening a pool on %s: %v", name, err)
	}
	t.Cleanup(func() {
		pool.Close()
		if _, err := admin.ExecContext(ctx, "DROP DATABASE "+name+" WITH (FORCE)"); err != nil {
			t.Errorf("dropping %s: %v", name, err)
		}
	})
	return pool
}

type heldMail struct {
	sent   []Message
	answer error
}

func (h *heldMail) Send(_ context.Context, message Message) error {
	h.sent = append(h.sent, message)
	return h.answer
}

func delivery(t *testing.T, pool *pgxpool.Pool, id [16]byte) (string, string) {
	t.Helper()
	var outcome string
	var detail *string
	if err := pool.QueryRow(context.Background(), "SELECT delivery, delivery_detail FROM alert.feedback WHERE id = $1", id).Scan(&outcome, &detail); err != nil {
		t.Fatal(err)
	}
	if detail == nil {
		return outcome, ""
	}
	return outcome, *detail
}

const holder = "FFyrQgpU4BQ2FLesy6t5MmPUDimPj2ghwChTMrLBN5DM"

func TestFeedbackIsKeptThenMailedWithWhatTheVisitorChoseToShare(t *testing.T) {
	pool := freshPool(t)
	mail := &heldMail{}
	desk := NewFeedback(pool, mail)
	ctx := context.Background()
	id, deliver, err := desk.Receive(ctx, Submission{Message: "Sell All stalled.\nTwice.", ReplyTo: "holder@example.com", Wallet: holder, Page: "/app/positions", Deployment: "production"})
	if err != nil {
		t.Fatalf("receiving: %v", err)
	}
	if outcome, _ := delivery(t, pool, id); outcome != "pending" {
		t.Fatalf("before delivery: got %s, want pending, so a crash between the two loses nothing", outcome)
	}
	deliver(ctx)
	if outcome, _ := delivery(t, pool, id); outcome != "delivered" {
		t.Fatalf("after delivery: got %s", outcome)
	}
	if len(mail.sent) != 1 {
		t.Fatalf("mailed %d messages", len(mail.sent))
	}
	sent := mail.sent[0]
	if sent.Subject != "Seametry feedback: Sell All stalled." || sent.ReplyTo == nil || sent.ReplyTo.Address != "holder@example.com" {
		t.Fatalf("subject or reply-to: %+v", sent)
	}
	for _, line := range []string{"Twice.", "Page: /app/positions", "Wallet: " + holder, "on production"} {
		if !strings.Contains(sent.Body, line) {
			t.Errorf("body lacks %q:\n%s", line, sent.Body)
		}
	}
}

func TestAFailedDeliveryKeepsTheMessageAndItsReason(t *testing.T) {
	pool := freshPool(t)
	desk := NewFeedback(pool, &heldMail{answer: errors.New("alert: smtp.hostinger.com:465 refused the login for team@beyndtech.com: 535 authentication failed")})
	id, deliver, err := desk.Receive(context.Background(), Submission{Message: "hello", Deployment: "production"})
	if err != nil {
		t.Fatal(err)
	}
	deliver(context.Background())
	outcome, detail := delivery(t, pool, id)
	if outcome != "failed" || !strings.Contains(detail, "535") {
		t.Fatalf("got %s %q, want failed with the server's answer", outcome, detail)
	}
}

func TestWithoutAMailerFeedbackIsKeptAndSaysSo(t *testing.T) {
	pool := freshPool(t)
	desk := NewFeedback(pool, nil)
	id, deliver, err := desk.Receive(context.Background(), Submission{Message: "hello", Deployment: "development"})
	if err != nil {
		t.Fatal(err)
	}
	deliver(context.Background())
	if outcome, detail := delivery(t, pool, id); outcome != "not_configured" || !strings.Contains(detail, "SEAMETRY_SMTP_HOST") {
		t.Fatalf("got %s %q", outcome, detail)
	}
}

func TestFeedbackIsRefusedNamingWhatIsWrong(t *testing.T) {
	desk := NewFeedback(nil, nil)
	for name, submission := range map[string]Submission{
		"empty":      {Message: "   ", Deployment: "production"},
		"long":       {Message: strings.Repeat("a", 4001), Deployment: "production"},
		"reply name": {Message: "x", ReplyTo: "Holder <holder@example.com>", Deployment: "production"},
		"reply crlf": {Message: "x", ReplyTo: "holder@example.com\r\nBcc: a@b.c", Deployment: "production"},
		"wallet":     {Message: "x", Wallet: "not-a-wallet", Deployment: "production"},
		"deployment": {Message: "x", Deployment: "staging"},
	} {
		var invalid Invalid
		if _, _, err := desk.Receive(context.Background(), submission); !errors.As(err, &invalid) {
			t.Errorf("%s: got %v, want Invalid", name, err)
		}
	}
}

func TestARefusedReplyAddressIsNamedByFieldAndCodeNeverRepeated(t *testing.T) {
	desk := NewFeedback(nil, nil)
	_, _, err := desk.Receive(context.Background(), Submission{Message: "x", ReplyTo: "Holder <holder.private@example.com>", Deployment: "production"})
	var invalid Invalid
	if !errors.As(err, &invalid) || invalid.Field != "reply_to" || invalid.Code != "malformed" {
		t.Fatalf("got %#v, want Invalid with field reply_to and code malformed", err)
	}
	if strings.Contains(err.Error(), "holder.private") {
		t.Fatalf("the refusal repeats the address: %q", err.Error())
	}
}
