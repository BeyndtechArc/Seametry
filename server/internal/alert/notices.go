package alert

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/BeyndtechArc/Seametry/server/internal/store/alertdb"
)

// Settlement is one leg the chain has answered for, as Alert needs it.
type Settlement struct {
	Wallet               string
	Symbol               string
	Mint                 string
	Signature            string
	Outcome              string
	ChainError           string
	FirstLandedForWallet bool
}

// Notices keeps and mails the alerts the team receives about recorded activity.
type Notices struct {
	q      *alertdb.Queries
	mailer Sender
	now    func() time.Time
}

// NewNotices keeps notices in db and mails them through mailer, which may be
// nil: the notice is still kept, marked not_configured.
func NewNotices(db alertdb.DBTX, mailer Sender) *Notices {
	return &Notices{q: alertdb.New(db), mailer: mailer, now: time.Now}
}

func short(wallet string) string {
	if len(wallet) < 10 {
		return wallet
	}
	return wallet[:4] + "…" + wallet[len(wallet)-4:]
}

// worthANotice is a leg that did not land, or a wallet's first that did. A
// routine landing is in the Admin, not the inbox.
func worthANotice(s Settlement) bool {
	return s.Outcome == "failed" || s.Outcome == "dropped" || (s.Outcome == "landed" && s.FirstLandedForWallet)
}

// compose writes one notice for a reconciler pass, or nothing when no leg in
// it is worth one.
func compose(items []Settlement) (string, string, bool) {
	var missed, firsts []Settlement
	for _, item := range items {
		if !worthANotice(item) {
			continue
		}
		if item.Outcome == "landed" {
			firsts = append(firsts, item)
		} else {
			missed = append(missed, item)
		}
	}
	if len(missed)+len(firsts) == 0 {
		return "", "", false
	}
	parts := []string{}
	if len(missed) > 0 {
		parts = append(parts, fmt.Sprintf("%d %s did not land", len(missed), map[bool]string{true: "leg", false: "legs"}[len(missed) == 1]))
	}
	if len(firsts) > 0 {
		parts = append(parts, fmt.Sprintf("%d new %s traded", len(firsts), map[bool]string{true: "wallet", false: "wallets"}[len(firsts) == 1]))
	}
	var body strings.Builder
	line := func(item Settlement) {
		name := item.Symbol
		if name == "" {
			name = item.Mint
		}
		fmt.Fprintf(&body, "%s  %s  wallet %s\nhttps://solscan.io/tx/%s\n", item.Outcome, name, short(item.Wallet), item.Signature)
		if item.ChainError != "" {
			fmt.Fprintf(&body, "chain error: %s\n", item.ChainError)
		}
		body.WriteString("\n")
	}
	if len(missed) > 0 {
		body.WriteString("Did not land\n\n")
		for _, item := range missed {
			line(item)
		}
	}
	if len(firsts) > 0 {
		body.WriteString("First landed trade for a wallet\n\n")
		for _, item := range firsts {
			line(item)
		}
	}
	body.WriteString("Read on chain by Seametry's reconciler. Failed legs paid their network fee; dropped legs reached no block and moved nothing.")
	return "Seametry: " + strings.Join(parts, ", "), body.String(), true
}

// Settlements keeps one notice for a reconciler pass and mails it. A pass
// with nothing worth a notice writes and sends nothing.
func (n *Notices) Settlements(ctx context.Context, items []Settlement) error {
	subject, body, worth := compose(items)
	if !worth {
		return nil
	}
	id, err := newID()
	if err != nil {
		return err
	}
	created := n.now().UTC()
	if err := n.q.InsertNotice(ctx, alertdb.InsertNoticeParams{
		ID: pgtype.UUID{Bytes: id, Valid: true}, Kind: "settlements", Subject: truncate(subject, 200), Body: truncate(body, 20000),
		CreatedAt: pgtype.Timestamptz{Time: created, Valid: true},
	}); err != nil {
		return fmt.Errorf("alert: keeping a settlements notice: %w", err)
	}
	outcome, detail := "not_configured", "SEAMETRY_SMTP_HOST is not set on this Gateway."
	if n.mailer != nil {
		outcome, detail = "delivered", ""
		if err := n.mailer.Send(ctx, Message{Subject: subject, Body: body}); err != nil {
			outcome, detail = "failed", truncate(err.Error(), 1000)
		}
	}
	err = n.q.RecordNoticeDelivery(ctx, alertdb.RecordNoticeDeliveryParams{
		ID: pgtype.UUID{Bytes: id, Valid: true}, Delivery: outcome, DeliveryDetail: text(detail),
		DeliveredAt: pgtype.Timestamptz{Time: n.now().UTC(), Valid: outcome == "delivered"},
	})
	if outcome == "failed" || err != nil {
		slog.Warn("alert: settlements notice", "outcome", outcome, "detail", detail, "record_error", err)
	}
	return err
}
